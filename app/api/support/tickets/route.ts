import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { equipStore } from "@/lib/equip-store";

const STEE_SUPPORT_INTAKE_URL =
  process.env.STEE_SUPPORT_INTAKE_URL ??
  "https://admin.stee-suite.com/api/intake/tickets";
const STEE_SUPPORT_TICKETS_BASE_URL =
  process.env.STEE_SUPPORT_TICKETS_BASE_URL ??
  "https://admin.stee-suite.com/api/intake/tickets";
const EQUIP_DISPATCH_APP_KEY =
  process.env.STEE_SUPPORT_APP_KEY ?? "equip-dispatch";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const formData = contentType.includes("multipart/form-data")
    ? await request.formData().catch(() => null)
    : null;
  const body = formData
    ? {
        type: formData.get("type"),
        priority: formData.get("priority"),
        urgency: formData.get("urgency"),
        subject: formData.get("subject"),
        description: formData.get("description"),
        steps: formData.get("steps"),
        pageUrl: formData.get("pageUrl"),
        page_url: formData.get("page_url"),
        area: formData.get("area"),
      }
    : await request.json().catch(() => ({}));
  const type = String(body.type ?? "issue").trim();
  const priority = String(body.priority ?? body.urgency ?? "normal").trim();
  const subject = String(body.subject ?? "").trim();
  const description = String(body.description ?? "").trim();
  const steps = String(body.steps ?? "").trim();
  const pageUrl = String(body.pageUrl ?? body.page_url ?? "").trim();
  const area = String(body.area ?? "general").trim();
  const attachmentFiles = formData
    ? formData
        .getAll("attachments")
        .filter((value): value is File => value instanceof File && value.size > 0)
    : [];
  const attachments: Array<{ name: string; type: string; size: number }> = attachmentFiles.map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
  }));

  if (!subject || !description) {
    return NextResponse.json(
      { error: "Subject and description are required" },
      { status: 400 }
    );
  }

  const details = [
    `Type: ${type}`,
    `Priority: ${priority}`,
    `Area: ${area}`,
    description,
    steps ? `Steps to Reproduce:\n${steps}` : "",
    attachments.length > 0
      ? `Attachments:\n${attachments
          .map((item) => `- ${item.name}${item.size ? ` (${Math.round(item.size / 1024)} KB)` : ""}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const intakePayload = new FormData();
    intakePayload.set("appKey", EQUIP_DISPATCH_APP_KEY);
    intakePayload.set("app_key", EQUIP_DISPATCH_APP_KEY);
    intakePayload.set("subject", subject);
    intakePayload.set("description", details);
    intakePayload.set("name", user.name);
    intakePayload.set("email", user.email);
    intakePayload.set("role", user.role);
    intakePayload.set("page_url", pageUrl);
    intakePayload.set("browser_info", request.headers.get("user-agent") ?? "");
    attachmentFiles.forEach((file) => intakePayload.append("attachments", file));

    const intakeUrl = `${STEE_SUPPORT_INTAKE_URL}?appKey=${encodeURIComponent(EQUIP_DISPATCH_APP_KEY)}`;

    const response = await fetch(intakeUrl, {
      method: "POST",
      body: intakePayload,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to submit support ticket" },
        { status: response.status }
      );
    }

    await equipStore.addAuditEntry({
      ts: new Date().toISOString(),
      who: user.name,
      role: user.role,
      action: "Support Ticket Submitted",
      detail: `${subject}${data.ticket_number ? ` (${data.ticket_number})` : ""}`,
      ref: data.ticket_number ?? "SUPPORT",
    });

    return NextResponse.json(
      {
        success: true,
        id: data.id ?? null,
        ticketNumber: data.ticket_number ?? null,
        message: data.message ?? "Support ticket submitted",
        submittedAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Support submission could not reach admin.stee-suite.com. Check internet access and try again.",
      },
      { status: 502 }
    );
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = `${STEE_SUPPORT_TICKETS_BASE_URL}/mine?appKey=${encodeURIComponent(
      EQUIP_DISPATCH_APP_KEY
    )}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}`;

    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to load support tickets" },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({ tickets: data.tickets ?? [] });
  } catch {
    return NextResponse.json(
      { error: "Support server unavailable" },
      { status: 503 }
    );
  }
}

import ConfigurationClient from "./ConfigurationClient";
import { LOOKUP_DEFS } from "@/lib/lookup-defs";

export default function ConfigurationPage() {
  return <ConfigurationClient defs={LOOKUP_DEFS} />;
}

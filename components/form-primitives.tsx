export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="mb-1 text-[12px]" style={{ color: "#273951", fontWeight: 500 }}>
      {children}
      {required && <span style={{ color: "#e5484d" }}> *</span>}
    </div>
  );
}

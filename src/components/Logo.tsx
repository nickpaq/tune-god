export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="2.5" y="2.5" width="95" height="95" rx="22" fill="#18131e" stroke="#f4f1f7" strokeWidth="3" />
      <circle cx="26" cy="35" r="15" fill="#332b3c" stroke="#f4f1f7" strokeWidth="3" />
      <circle cx="74" cy="35" r="15" fill="#332b3c" stroke="#f4f1f7" strokeWidth="3" />
      <circle cx="26" cy="35" r="7" fill="#ef4f70" />
      <circle cx="74" cy="35" r="7" fill="#ef4f70" />
      <circle cx="50" cy="57" r="29" fill="#332b3c" stroke="#f4f1f7" strokeWidth="3" />
      <circle cx="38" cy="53" r="4.4" fill="#f4f1f7" />
      <circle cx="62" cy="53" r="4.4" fill="#f4f1f7" />
      <ellipse cx="50" cy="66" rx="10.5" ry="8" fill="#ef4f70" />
    </svg>
  );
}

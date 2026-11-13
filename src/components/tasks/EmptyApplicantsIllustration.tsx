/** "portfolio 1" from the BZB Re-Design file (My Applications empty state), redrawn as SVG. */
const EmptyApplicantsIllustration = ({ className }: { className?: string }) => (
  <svg viewBox="140 80 510 540" className={className} aria-hidden="true">
    <defs>
      <clipPath id="eai-avatar"><circle cx="328" cy="266" r="123" /></clipPath>
    </defs>
    <rect x="400" y="86" width="203" height="529" rx="30" fill="#D9693F" />
    <rect x="400" y="133" width="241" height="435" rx="25" fill="#DCD6EE" />
    {[209, 266, 323, 380, 437, 494].map((y) => (
      <line key={y} x1="515" y1={y} x2="566" y2={y} stroke="#6559B5" strokeWidth="14" strokeLinecap="round" />
    ))}
    <rect x="148" y="86" width="360" height="529" rx="30" fill="#F7D5C6" />
    <circle cx="328" cy="266" r="123" fill="#DCD6EE" />
    <g clipPath="url(#eai-avatar)" fill="#6559B5">
      <circle cx="328" cy="242" r="52" />
      <ellipse cx="328" cy="395" rx="105" ry="100" />
    </g>
    <line x1="243" y1="465" x2="413" y2="465" stroke="#6559B5" strokeWidth="14" strokeLinecap="round" />
    <line x1="243" y1="522" x2="413" y2="522" stroke="#6559B5" strokeWidth="14" strokeLinecap="round" />
  </svg>
);

export default EmptyApplicantsIllustration;

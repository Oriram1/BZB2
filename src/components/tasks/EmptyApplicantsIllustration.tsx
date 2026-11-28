import applicantsIllustration from "@/assets/figma-applicants.svg";

const EmptyApplicantsIllustration = ({ className }: { className?: string }) => (
  <img src={applicantsIllustration} className={className} alt="" aria-hidden="true" />
);

export default EmptyApplicantsIllustration;

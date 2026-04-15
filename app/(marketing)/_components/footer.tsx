import { Button } from "@/components/ui/button";
import Logo from "./logo";

const Footer = () => {
  return (
    <div className="z-50 flex w-full flex-col gap-3 bg-background p-4 dark:bg-[#1F1F1F] sm:flex-row sm:items-center sm:p-6">
      <Logo />
      <div className="flex w-full items-center justify-center gap-x-2 text-muted-foreground sm:ml-auto sm:w-auto sm:justify-end">
        <Button variant="ghost" size="sm">
          Privary Policy
        </Button>
        <Button variant="ghost" size="sm">
          Terms & Conditions
        </Button>
      </div>
    </div>
  );
};

export default Footer;

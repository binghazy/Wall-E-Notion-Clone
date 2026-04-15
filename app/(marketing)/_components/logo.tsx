import Image from "next/image";
import { Poppins } from "next/font/google";
import { cn } from "@/lib/utils";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "600"],
});

const Logo = () => {
  return (
    <div className="flex items-center gap-x-2">
      <Image
        src="/logo.svg"
        height="44"
        width="44"
        alt="Logo"
        className="dark:hidden sm:h-[60px] sm:w-[60px]"
      />
      <Image
        src="/logo-dark.svg"
        height="44"
        width="44"
        alt="Logo"
        className="hidden dark:block sm:h-[60px] sm:w-[60px]"
      />
      <p className={cn("hidden whitespace-nowrap font-semibold sm:block", font.className)}>
        Wall-E AI
      </p>
    </div>
  );
};

export default Logo;

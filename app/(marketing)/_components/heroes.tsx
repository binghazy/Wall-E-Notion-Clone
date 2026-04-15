import Image from "next/image";
const Heroes = () => {
  return (
    <div
      className="flex flex-col items-center justify-center
  max-w-5xl -mt-4 md:-mt-6"
    >
      <div className="flex items-center justify-center">
        <div className="relative h-[240px] w-[240px] sm:h-[320px] sm:w-[320px] md:h-[400px] md:w-[400px]">
          <Image
            src="/walle.png"
            fill
            className="object-contain dark:hidden"
            alt="Documents"
          />
          <Image
            src="/walle-dark.png"
            fill
            className="object-contain hidden dark:block"
            alt="Documents"
          />
        </div>
      </div>
    </div>
  );
};

export default Heroes;

import Image from "next/image";
const Heroes = () => {
  return (
    <div
      className="flex flex-col items-center justify-center
  max-w-5xl"
    >
      <div className="flex items-center justify-center">
        <div className="relative h-[400px] w-[400px]">
          <Image
            src="/WALLE.png"
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

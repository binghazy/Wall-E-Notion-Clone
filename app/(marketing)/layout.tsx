import Navbar from "./_components/navbar";

const MarketingLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen dark:bg-[#1F1F1F]">
      <Navbar />
      <main className="min-h-screen pt-40 dark:bg-[#1F1F1F]">{children}</main>
    </div>
  );
};

export default MarketingLayout;

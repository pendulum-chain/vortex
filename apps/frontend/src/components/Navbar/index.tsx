import { DesktopNavbar } from "./DesktopNavbar";
import { MobileNavbar } from "./MobileNavbar";

export const Navbar = () => (
  <header className="relative z-30">
    <div className="hidden sm:block">
      <DesktopNavbar />
    </div>

    <div className="block sm:hidden">
      <MobileNavbar />
    </div>
  </header>
);

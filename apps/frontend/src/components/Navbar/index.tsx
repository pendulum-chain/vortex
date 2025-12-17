import { DesktopNavbar } from "./DesktopNavbar";
import { MobileNavbar } from "./MobileNavbar";

export const Navbar = () => (
  <header>
    <div className="hidden sm:block">
      <DesktopNavbar />
    </div>

    <div className="block sm:hidden">
      <MobileNavbar />
    </div>
  </header>
);

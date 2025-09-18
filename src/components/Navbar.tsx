import logo from "../assets/svg/logo.svg";
import tikka from "../assets/svg/Tikka.svg";

const Navbar = () => {
    return (
        <nav className="w-full flex items-center justify-between px-22">
            <div className="flex items-center space-x-3">
                <img src={logo} alt="logo" />
                <img src={tikka} alt="tikka" className="mt-2" />
            </div>
            <div className="flex items-center space-x-2 justify-right">
                <p className="p-4">Discover Raffles</p>
                <p className="p-4">Create Raffle</p>
                <button className="bg-[#fe3796] px-8 py-4 rounded-xl">
                    Get Started
                </button>
            </div>
        </nav>
    );
};

export default Navbar;

import RocketLaunch from "../../assets/svg/RocketLaunch";
import dummyImage from "../../assets/svg/dummyImage.svg";

const Hero = () => {
    return (
        <div className="flex items-center space-x-16 px-22">
            <div className="flex flex-col space-y-8 w-1/2">
                <div>
                    <span className="text-xs bg-[#121628] py-2 px-4 rounded-full mb-4">
                        A New Way to Win Together
                    </span>
                </div>

                <h1 className="text-[67px] font-bold mb-4">
                    Raffles Made <br /> Fun. Fair. For <br /> Everyone.
                </h1>
                <p className="text-[22px] mb-8 w-[60%]">
                    Host raffles, join raffles, and enjoy the thrill of fair
                    play-all in one simple platform.
                </p>
                <div>
                    <button className="bg-[#fe3796] px-16 py-4 rounded-xl flex items-center space-x-4">
                        <RocketLaunch />
                        <span>Get Started</span>
                    </button>
                </div>

                <div className="flex w-full justify-between">
                    <div>
                        <p className="font-bold text-xl">$240K</p>
                        <p className="text-xs">Total sale</p>
                    </div>
                    <div>
                        <p className="font-bold text-xl">$100k+</p>
                        <p className="text-xs">Raffles</p>
                    </div>
                    <div>
                        <p className="font-bold text-xl">10K+</p>
                        <p className="text-xs">Players</p>
                    </div>
                </div>
            </div>
            <div className="w-1/2 flex justify-end">
                <img src={dummyImage} alt="hero-img" className="" />
            </div>
        </div>
    );
};

export default Hero;

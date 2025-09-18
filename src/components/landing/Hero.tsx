import RocketLaunch from "../../assets/svg/RocketLaunch";
import dummyImage from "../../assets/svg/dummyImage.svg";

const Hero = () => {
    return (
        <section className="px-6 md:px-12 lg:px-22 py-12">
            <div className="flex flex-col-reverse items-center gap-12 md:flex-row md:gap-16 mx-auto max-w-7xl px-6 md:px-12 lg:px-16">
                {/* Left: Text */}
                <div className="flex flex-col space-y-8 w-full md:w-1/2 text-center md:text-left">
                    <div>
                        <span className="text-xs bg-[#121628] py-2 px-4 rounded-full mb-4 inline-block">
                            A New Way to Win Together
                        </span>
                    </div>

                    <h1 className="text-4xl md:text-6xl lg:text-[67px] font-bold mb-4 leading-tight">
                        Raffles Made <br className="hidden md:block" /> Fun.
                        Fair. For <br className="hidden md:block" /> Everyone.
                    </h1>

                    <p className="text-lg md:text-xl lg:text-[22px] mb-8 md:w-[80%] mx-auto md:mx-0">
                        Host raffles, join raffles, and enjoy the thrill of fair
                        play—all in one simple platform.
                    </p>

                    <div>
                        <button className="bg-[#fe3796] px-10 md:px-16 py-4 rounded-xl flex items-center justify-center space-x-4 mx-auto md:mx-0">
                            <RocketLaunch />
                            <span>Get Started</span>
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="flex justify-around md:justify-between w-full pt-6">
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

                {/* Right: Image */}
                <div className="w-full md:w-1/2 flex justify-center md:justify-end">
                    <img
                        src={dummyImage}
                        alt="hero-img"
                        className="max-w-xs sm:max-w-sm md:max-w-md lg:max-w-full"
                    />
                </div>
            </div>
        </section>
    );
};

export default Hero;

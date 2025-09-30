import { Ticket, Users } from "lucide-react";
import { ProgressBar } from "./ui/ProgressBar";
import Avatar from "../assets/Avatar.png";
import Tag from "./ui/Tag";

const tags = ["Holiday", "Travel", "Mad Raffle", "Easy", "Lfg"];

const AboutRaffle = () => {
    return (
        <div className="w-full flex flex-col space-y-5">
            <h3 className="font-semibold text-[22px] text-[#858584]">
                About This Raffle
            </h3>

            <p className="font-semibold text-base md:text-lg">
                Win this amazing Lamborghini Aventador 2023 Limited Edition! One
                lucky winner will drive away with this dream supercar valued at
                over $500,000.
            </p>

            {/* Stats: stack on xs, row on sm+ */}
            <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                <div className="bg-[#9D4EDD33] flex items-center space-x-4 p-4 w-full rounded-xl">
                    <Users color="#9D4EDD" size={20} />
                    <div>
                        <p className="text-[#9CA3AF] text-[12px]">
                            Participants
                        </p>
                        <p className="font-semibold">2,458 / 5,000</p>
                    </div>
                </div>

                <div className="bg-[#9D4EDD33] flex items-center space-x-4 p-4 w-full rounded-xl">
                    <Ticket color="#9D4EDD" size={20} />
                    <div>
                        <p className="text-[#9CA3AF] text-[12px]">
                            Tickets Sold
                        </p>
                        <p className="font-semibold">14,782</p>
                    </div>
                </div>
            </div>

            {/* Progress */}
            <div className="w-full">
                <ProgressBar value={49} />
            </div>

            {/* Creator */}
            <div>
                <h2 className="text-[#858584] font-semibold text-[22px]">
                    Created By
                </h2>
                <div className="mt-3 flex items-center gap-3">
                    <img
                        src={Avatar}
                        alt="Creator avatar"
                        className="h-12 w-12 rounded-full object-cover"
                    />
                    <p className="font-semibold">Orbitian</p>
                </div>
            </div>

            {/* Tags */}
            <div>
                <h2 className="text-[#858584] font-semibold text-[22px]">
                    Tags
                </h2>
                <div className="flex flex-wrap gap-3 mt-3">
                    {tags.map((tag) => (
                        <Tag key={tag} text={tag} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AboutRaffle;

import { Ticket, Users } from "lucide-react";
import { ProgressBar } from "./ui/ProgressBar";
import Avatar from "../assets/Avatar.png";
import Tag from "./ui/Tag";
import { Link } from "react-router-dom";

const tags = ["Holiday", "Travel", "Mad Raffle", "Easy", "Lfg"];

interface AboutRaffleProps {
    description?: string;
    participants?: number;
    maxParticipants?: number;
    ticketsSold?: number;
    progress?: number;
    creator?: string;
    creatorName?: string;
}

const AboutRaffle: React.FC<AboutRaffleProps> = ({
    description,
    participants = 0,
    maxParticipants = 0,
    ticketsSold = 0,
    progress = 0,
    creator = "Orbitian",
    creatorName = "Orbitian",
}) => {
    return (
        <div className="w-full flex flex-col space-y-5">
            <h3 className="font-semibold text-[22px] text-[#858584]">
                About This Raffle
            </h3>

            <p className="font-semibold text-base md:text-lg">
                {description || "Win this amazing prize! One lucky winner will drive away with this dream item."}
            </p>

            {/* Stats: stack on xs, row on sm+ */}
            <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                <div className="bg-[#9D4EDD33] flex items-center space-x-4 p-4 w-full rounded-xl">
                    <Users color="#9D4EDD" size={20} />
                    <div>
                        <p className="text-gray-600 dark:text-[#9CA3AF] text-[12px]">
                            Participants
                        </p>
                        <p className="font-semibold">{participants.toLocaleString()} / {maxParticipants.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-[#9D4EDD33] flex items-center space-x-4 p-4 w-full rounded-xl">
                    <Ticket color="#9D4EDD" size={20} />
                    <div>
                        <p className="text-gray-600 dark:text-[#9CA3AF] text-[12px]">
                            Tickets Sold
                        </p>
                        <p className="font-semibold">{ticketsSold.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Progress */}
            <div className="w-full">
                <ProgressBar value={progress} />
            </div>

            {/* Creator */}
            <div>
                <h2 className="text-[#858584] font-semibold text-[22px]">
                    Created By
                </h2>
                <Link to={`/creators/${creator}`} className="mt-3 flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <img
                        src={Avatar}
                        alt="Creator avatar"
                        className="h-12 w-12 rounded-full object-cover"
                    />
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{creatorName}</p>
                        <p className="text-xs text-gray-500 font-mono">{creator.slice(0, 6)}...{creator.slice(-4)}</p>
                    </div>
                </Link>
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

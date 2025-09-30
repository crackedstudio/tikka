import one from "../assets/1.png";
import two from "../assets/2.png";
import three from "../assets/3.png";
import four from "../assets/4.png";
import five from "../assets/5.png";
import six from "../assets/6.png";
import seven from "../assets/7.png";
import eight from "../assets/8.png";

const images = [one, two, three, four, five, six, seven, eight];

const RecentParticipants = () => {
    return (
        <div>
            <div className="flex justify-between">
                <p className="text-[#858584] text-[22px]">
                    Recent Participants
                </p>
                <p className="text-[#00E6CC] text-sm">View All</p>
            </div>
            <div className="mt-8 flex space-x-4">
                {images.map((img, index) => (
                    <img
                        key={index}
                        src={img}
                        alt={`Participant ${index + 1}`}
                        className="w-12 h-12 rounded-full object-cover"
                    />
                ))}
            </div>
        </div>
    );
};

export default RecentParticipants;

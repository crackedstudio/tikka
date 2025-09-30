import RaffleDetailsCard from "../components/cards/RaffleDetailsCard";
import ShareRaffle from "../components/ShareRaffle";
import VerifiedBadge from "../components/VerifiedBadge";
import detailimage from "../assets/detailimage.png";

const RaffleDetails = () => {
    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
            <RaffleDetailsCard
                image={detailimage}
                title="Bali All Sponsored Ticket"
                body="Win a 7-day all-inclusive stay at a 5-star resort in Bali, including flights 
and activities for two people."
                prizeValue={"75"}
                prizeCurrency="ETH"
                countdown={{
                    days: "01",
                    hours: "12",
                    minutes: "45",
                    seconds: "33",
                }}
                onEnter={() => alert("Entered Raffle!")}
            />
            <VerifiedBadge />
            <ShareRaffle />
        </div>
    );
};

export default RaffleDetails;

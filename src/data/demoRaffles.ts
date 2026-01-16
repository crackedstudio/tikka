export type DemoRaffle = {
    id: number;
    title: string;
    description: string;
    image: string;
    prizeValue: string;
    prizeCurrency: string;
    ticketPriceEth: number;
    maxTickets: number;
    totalTicketsSold: number;
    endTime: number;
    isActive: boolean;
    tags: string[];
};

const now = Math.floor(Date.now() / 1000);

export const demoRaffles: DemoRaffle[] = [
    {
        id: 101,
        title: "Tesla Model 3 Performance",
        description: "Win a brand new Tesla Model 3 in stealth black.",
        image: "/src/assets/teslmdl.png",
        prizeValue: "1",
        prizeCurrency: "Tesla Model 3",
        ticketPriceEth: 0.02,
        maxTickets: 5000,
        totalTicketsSold: 3280,
        endTime: now + 60 * 60 * 24 * 5,
        isActive: true,
        tags: ["Automotive", "Tech"],
    },
    {
        id: 102,
        title: "PlayStation 5 Bundle",
        description: "PS5 + 2 controllers + 5 games.",
        image: "/src/assets/ps5.png",
        prizeValue: "1",
        prizeCurrency: "PS5 Bundle",
        ticketPriceEth: 0.005,
        maxTickets: 2000,
        totalTicketsSold: 640,
        endTime: now + 60 * 60 * 24 * 2,
        isActive: true,
        tags: ["Gaming", "Electronics"],
    },
    {
        id: 103,
        title: "Creator Starter Pack",
        description: "Camera, mic, and lighting to level up your content.",
        image: "/src/assets/cptpnk.png",
        prizeValue: "1",
        prizeCurrency: "Creator Kit",
        ticketPriceEth: 0.01,
        maxTickets: 3000,
        totalTicketsSold: 1200,
        endTime: now + 60 * 60 * 24 * 3,
        isActive: true,
        tags: ["Creator", "Gear"],
    },
    {
        id: 104,
        title: "Dream Home Upgrade",
        description: "Luxury living room makeover package.",
        image: "/src/assets/detailimage.png",
        prizeValue: "1",
        prizeCurrency: "Home Upgrade",
        ticketPriceEth: 0.008,
        maxTickets: 2500,
        totalTicketsSold: 2500,
        endTime: now - 60 * 60 * 12,
        isActive: false,
        tags: ["Lifestyle", "Home"],
    },
    {
        id: 105,
        title: "Streetwear Vault",
        description: "Limited edition drops from top streetwear brands.",
        image: "/src/assets/featraff.png",
        prizeValue: "1",
        prizeCurrency: "Streetwear Pack",
        ticketPriceEth: 0.006,
        maxTickets: 1500,
        totalTicketsSold: 980,
        endTime: now + 60 * 60 * 24,
        isActive: true,
        tags: ["Fashion", "Collectibles"],
    },
    {
        id: 106,
        title: "VIP Concert Experience",
        description: "Backstage passes + travel for two.",
        image: "/src/assets/hero-img.png",
        prizeValue: "2",
        prizeCurrency: "VIP Passes",
        ticketPriceEth: 0.012,
        maxTickets: 1800,
        totalTicketsSold: 420,
        endTime: now + 60 * 60 * 24 * 7,
        isActive: true,
        tags: ["Music", "Experience"],
    },
];


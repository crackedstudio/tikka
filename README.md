# 🎟️ Tikka - Decentralized Raffle Platform

<div align="center">
  <img src="src/assets/svg/Tikka.svg" alt="Tikka Logo" width="200" height="200">
  
  **A fully onchain raffle platform built on Base Sepolia**
  
  [![React](https://img.shields.io/badge/React-18.0-blue.svg)](https://reactjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
  [![Vite](https://img.shields.io/badge/Vite-7.0-purple.svg)](https://vitejs.dev/)
  [![OnchainKit](https://img.shields.io/badge/OnchainKit-Latest-green.svg)](https://onchainkit.xyz/)
  [![Base](https://img.shields.io/badge/Base-Sepolia-blue.svg)](https://base.org/)
</div>

---

## 📖 What is Tikka?

**Tikka** is a revolutionary decentralized raffle platform that brings transparency, fairness, and accessibility to the world of online raffles. Built entirely on blockchain technology, Tikka eliminates the need for trusted intermediaries while ensuring provably fair outcomes.

### 🎯 Core Concept

Tikka transforms traditional raffles by:

-   **Eliminating intermediaries** - No central authority controls the process
-   **Ensuring transparency** - All raffle data is publicly verifiable on-chain
-   **Providing fairness** - Random number generation through Chainlink VRF
-   **Enabling global access** - Anyone with a wallet can participate
-   **Reducing costs** - No platform fees, only gas costs

---

## 🚀 Key Features

### 🎟️ **Raffle Creation & Management**

-   **Easy Setup**: Create raffles with custom parameters in minutes
-   **Flexible Pricing**: Set ticket prices in ETH or ERC20 tokens
-   **Custom Duration**: Choose raffle end times from hours to days
-   **Rich Metadata**: Upload images, descriptions, and prize details
-   **Category System**: Organize raffles by type and interest

### 🎲 **Provably Fair Randomness**

-   **Chainlink VRF**: Industry-standard verifiable randomness
-   **Transparent Selection**: All randomness is publicly verifiable
-   **Tamper-Proof**: No possibility of manipulation or bias
-   **Instant Results**: Winners are selected automatically

### 💰 **Flexible Payment System**

-   **ETH Raffles**: Pay with native Ethereum
-   **Token Raffles**: Support for any ERC20 token
-   **Automatic Distribution**: Winnings distributed automatically
-   **Gas Optimization**: Efficient smart contract design

### 🏆 **Comprehensive Platform**

-   **Live Leaderboards**: Real-time participant rankings
-   **Winner Announcements**: Automated winner notifications
-   **User Profiles**: Track participation and winnings
-   **Social Features**: Share and discover raffles

---

## 🏗️ Technical Architecture

### **Frontend Stack**

```
React 18 + TypeScript + Vite
├── UI Components (Tailwind CSS)
├── State Management (React Hooks)
├── Routing (React Router)
├── Wallet Integration (OnchainKit)
└── Contract Integration (wagmi + viem)
```

### **Blockchain Infrastructure**

```
Base Sepolia Network
├── Smart Contract (Solidity)
├── Chainlink VRF (Randomness)
├── Metadata Storage (Supabase)
└── Wallet Integration (OnchainKit)
```

### **Smart Contract Features**

-   **Raffle Management**: Create, join, and manage raffles
-   **Random Selection**: Chainlink VRF integration for fair winners
-   **Token Support**: ETH and ERC20 token compatibility
-   **Automatic Payouts**: Self-executing winner distribution
-   **Event Logging**: Comprehensive on-chain event tracking

---

## 🎯 How It Works

### **1. Create a Raffle**

```
User → Sets Parameters → Uploads Metadata → Deploys to Blockchain
├── Prize details and images
├── Ticket price and duration
├── Maximum participants
└── Prize distribution rules
```

### **2. Participants Join**

```
Users → Connect Wallet → Buy Tickets → Automatic Entry
├── Browse available raffles
├── Purchase tickets with ETH/tokens
├── Automatic entry into draw
└── Real-time leaderboard updates
```

### **3. Fair Selection**

```
Raffle Ends → Chainlink VRF → Random Winner → Automatic Payout
├── Time-based automatic closure
├── Verifiable random number generation
├── Transparent winner selection
└── Instant prize distribution
```

### **4. Results & Distribution**

```
Winner Selected → Prize Distributed → Event Logged → Notification Sent
├── Automatic smart contract execution
├── Prize sent to winner's wallet
├── On-chain event emission
└── User notification system
```

---

## 🛠️ Development Setup

### **Prerequisites**

-   Node.js 18+
-   npm or yarn
-   Git
-   Base Sepolia testnet ETH
-   OnchainKit API key

### **Installation**

1. **Clone the repository**

```bash
git clone https://github.com/your-username/tikka.git
cd tikka
```

2. **Install dependencies**

```bash
npm install
```

3. **Environment Configuration**
   Create `.env` file in the root directory:

```env
# OnchainKit Configuration
VITE_ONCHAINKIT_API_KEY=your_onchainkit_api_key_here

# Contract Configuration
VITE_RAFFLE_CONTRACT_ADDRESS=0x60fd4f42B818b173d7252859963c7131Ed68CA6D
VITE_CHAIN_ID=84532

# Supabase Configuration (for metadata)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_TABLE=raffle_metadata
```

4. **Start development server**

```bash
npm run dev
```

5. **Build for production**

```bash
npm run build
```

---

## 📁 Project Structure

```
tikka/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── cards/           # Raffle card components
│   │   ├── landing/         # Landing page components
│   │   ├── modals/          # Modal dialogs
│   │   └── ui/              # Basic UI elements
│   ├── pages/               # Main application pages
│   │   ├── Home.tsx         # Landing page
│   │   ├── CreateRaffle.tsx # Raffle creation flow
│   │   ├── MyRaffles.tsx    # User's raffles
│   │   └── Leaderboard.tsx  # Rankings page
│   ├── hooks/               # Custom React hooks
│   │   ├── useRaffleContract.ts # Contract interactions
│   │   └── useRaffles.ts    # Raffle data management
│   ├── services/            # External service integrations
│   │   └── metadataService.ts # Supabase metadata handling
│   ├── config/              # Configuration files
│   │   └── contract.ts       # Smart contract ABI and address
│   ├── types/               # TypeScript type definitions
│   │   └── types.ts         # Application interfaces
│   └── assets/              # Static assets
│       ├── images/          # Image files
│       └── svg/            # SVG icons
├── public/                  # Public static files
├── tests/                  # Test files
└── docs/                   # Documentation
```

---

## 🔧 Smart Contract Details

### **Contract Address**

```
Base Sepolia: 0x60fd4f42B818b173d7252859963c7131Ed68CA6D
```

### **Key Functions**

```solidity
// Create a new raffle
function createRaffle(
    string memory description,
    uint256 endTime,
    uint256 maxTickets,
    bool allowMultipleTickets,
    uint256 ticketPrice,
    address ticketToken
) external

// Buy tickets for a raffle
function buyTicket(uint256 raffleId) external payable

// Get raffle information
function getRaffleData(uint256 raffleId) external view returns (...)
function getActiveRaffleIds() external view returns (uint256[] memory)
function getAllRaffleIds() external view returns (uint256[] memory)

// Get user participation
function getUserRaffleParticipation(address user) external view returns (...)
```

### **Events**

```solidity
event RaffleCreated(uint256 indexed raffleId, address indexed creator);
event TicketPurchased(uint256 indexed raffleId, address indexed buyer, uint256 ticketId);
event RaffleFinalized(uint256 indexed raffleId, address indexed winner, uint256 winningTicketId);
```

---

## 🎨 User Interface

### **Design System**

-   **Color Palette**: Dark theme with vibrant accents
-   **Typography**: IBM Plex Sans for readability
-   **Components**: Modular, reusable design system
-   **Responsive**: Mobile-first design approach
-   **Accessibility**: WCAG 2.1 compliant

### **Key Pages**

1. **Landing Page**: Discover featured raffles and trending items
2. **Create Raffle**: Multi-step form for raffle creation
3. **Raffle Details**: Comprehensive raffle information and entry
4. **My Raffles**: User's created and participated raffles
5. **Leaderboard**: Rankings and statistics
6. **Winner Announcements**: Celebration of winners

---

## 🔐 Security Features

### **Smart Contract Security**

-   **Access Control**: Role-based permissions
-   **Reentrancy Protection**: Secure against attacks
-   **Integer Overflow Protection**: Safe math operations
-   **Event Logging**: Comprehensive audit trail

### **Frontend Security**

-   **Input Validation**: Client and server-side validation
-   **Wallet Security**: Secure wallet integration
-   **Data Encryption**: Sensitive data protection
-   **HTTPS**: Secure communication protocols

---

## 🚀 Deployment

### **Frontend Deployment**

```bash
# Build the application
npm run build

# Deploy to your preferred platform
# Vercel, Netlify, AWS, etc.
```

### **Smart Contract Deployment**

```bash
# Deploy to Base Sepolia
npx hardhat deploy --network baseSepolia

# Verify contract on BaseScan
npx hardhat verify --network baseSepolia
```

---

## 🧪 Testing

### **Frontend Testing**

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
```

### **Smart Contract Testing**

```bash
# Run contract tests
npx hardhat test

# Run gas optimization tests
npx hardhat test --gas-report
```

---

## 📊 Performance Optimization

### **Frontend Optimizations**

-   **Code Splitting**: Dynamic imports for better loading
-   **Image Optimization**: WebP format with fallbacks
-   **Bundle Analysis**: Regular bundle size monitoring
-   **Caching**: Intelligent data caching strategies

### **Blockchain Optimizations**

-   **Gas Efficiency**: Optimized contract functions
-   **Batch Operations**: Reduced transaction costs
-   **Event Indexing**: Efficient data retrieval
-   **Metadata Caching**: Off-chain data optimization

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### **Development Workflow**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

### **Documentation**

-   [API Documentation](docs/api.md)
-   [Smart Contract Guide](docs/contract.md)
-   [Deployment Guide](docs/deployment.md)
-   [Troubleshooting](docs/troubleshooting.md)

### **Community**

-   [Discord](https://discord.gg/tikka)
-   [Twitter](https://twitter.com/tikka)
-   [GitHub Issues](https://github.com/your-username/tikka/issues)

### **Contact**

-   **Email**: support@tikka.com
-   **Website**: https://tikka.com
-   **Documentation**: https://docs.tikka.com

---

## 🎉 Acknowledgments

-   **Base Network** for providing the infrastructure
-   **Chainlink** for verifiable randomness
-   **OnchainKit** for seamless wallet integration
-   **React Community** for the amazing ecosystem
-   **Open Source Contributors** for their valuable contributions

---

<div align="center">
  <p>Built with ❤️ by the Tikka Team</p>
  <p>Making raffles fair, transparent, and accessible to everyone</p>
</div>

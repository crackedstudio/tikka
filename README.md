# 🎟️ Tikka - Decentralized Raffle Platform

<div align="center">
  <img src="src/assets/svg/Tikka.svg" alt="Tikka Logo" width="200" height="200">
  
  **A fully onchain raffle platform built on Stellar**
  
  [![React](https://img.shields.io/badge/React-18.0-blue.svg)](https://reactjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
  [![Vite](https://img.shields.io/badge/Vite-7.0-purple.svg)](https://vitejs.dev/)
  [![Stellar](https://img.shields.io/badge/Stellar-Network-blue.svg)](https://stellar.org/)
  [![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contracts-orange.svg)](https://soroban.stellar.org/)
</div>

---

## Overview

Tikka is a decentralized raffle and gaming platform built on the **Stellar blockchain**, using **Soroban smart contracts** to deliver transparent, trust-minimized, and globally accessible raffles.

At its core, Tikka allows anyone to **host**, **join**, and **verify** raffles entirely onchain — removing the need to trust centralized operators. Every rule, payment, and outcome is enforced by smart contracts, making fairness provable rather than promised.

This iteration of Tikka is designed specifically for Stellar’s strengths: low fees, fast finality, and composable smart contracts through Soroban.

---

## The Problem

Traditional online raffles and giveaways suffer from three major issues:

-   **Lack of trust** — users cannot verify how winners are selected.
-   **Centralized control** — hosts can manipulate outcomes or disappear with funds.
-   **Limited accessibility** — high fees and complex UX prevent global participation.

Even many Web3 raffles still rely on offchain logic or opaque randomness, which undermines the promise of decentralization.

---

## The Solution

Tikka solves this by moving the entire raffle lifecycle onchain using **Soroban**:

-   Raffle creation, entry, settlement, and payouts are handled by smart contracts.
-   Funds are escrowed onchain and can only move according to predefined rules.
-   Winner selection uses **onchain randomness**, via **PRNG mechanisms or oracle-assisted randomness**, ensuring outcomes are unpredictable and verifiable.

Once deployed, a raffle runs autonomously — even the creator cannot interfere.

---

## How It Works (High-Level)

1. A host deploys a raffle contract specifying:
    - Prize details
    - Ticket price
    - Entry limits
    - End conditions
2. Participants enter by submitting transactions directly to the contract.
3. When the raffle ends:
    - A randomness source (PRNG or oracle-assisted) is invoked.
    - The contract deterministically selects a winner.
4. The prize is automatically transferred to the winning address.

All steps are publicly auditable on the Stellar ledger.

---

## Randomness & Fairness

Tikka prioritizes fairness as a first-class feature.

-   **PRNG-based randomness** can be used for lightweight, low-cost raffles.
-   **Oracle-assisted randomness** can be integrated for higher-stakes raffles where stronger unpredictability guarantees are required.

In both cases, the randomness input and selection logic are transparent, making the outcome reproducible and verifiable by anyone.

---

## Why Stellar + Soroban

Stellar is a strong fit for Tikka because:

-   **Low transaction fees** make micro-entries viable.
-   **Fast finality** improves user experience during live raffles.
-   **Soroban smart contracts** enable expressive yet efficient onchain logic.
-   **Global accessibility** aligns with Tikka’s goal of open participation.

By leveraging Soroban, Tikka keeps logic simple, deterministic, and secure.

---

## Vision

Tikka is not just a raffle app — it’s an **onchain gaming primitive**.

Over time, it can evolve into:

-   A foundation for community giveaways and loyalty programs
-   A plug-and-play raffle module for DAOs and creators
-   A fair, transparent alternative to centralized gaming mechanics

By combining Soroban smart contracts with verifiable randomness, Tikka demonstrates how simple games can be rebuilt as **trustless, autonomous systems** on Stellar.

---

## Status

This project represents an **alpha-stage build**, focused on validating:

-   Core raffle mechanics on Soroban
-   Onchain randomness strategies
-   End-to-end usability on Stellar Testnet

Future iterations will expand composability, UX, and advanced fairness guarantees.

---

## 🚀 Key Features

### 🎟️ **Raffle Creation & Management**

-   **Easy Setup**: Create raffles with custom parameters in minutes
-   **Flexible Pricing**: Set ticket prices in XLM or Stellar assets
-   **Custom Duration**: Choose raffle end times from hours to days
-   **Rich Metadata**: Upload images, descriptions, and prize details
-   **Category System**: Organize raffles by type and interest

### 🎲 **Provably Fair Randomness**

-   **Randomness Solution**: TBD
-   **Transparent Selection**: All randomness is publicly verifiable
-   **Tamper-Proof**: No possibility of manipulation or bias
-   **Instant Results**: Winners are selected automatically

### 💰 **Flexible Payment System**

-   **XLM Raffles**: Pay with native Stellar Lumens
-   **Asset Raffles**: Support for any Stellar asset
-   **Automatic Distribution**: Winnings distributed automatically
-   **Fee Optimization**: Efficient Soroban smart contract design

### 🏆 **Comprehensive Platform**

-   **Live Leaderboards**: Real-time participant rankings
-   **Winner Announcements**: Automated winner notifications
-   **User Profiles**: Track participation and winnings
-   **Social Features**: Share and discover raffles

---

## 🏗️ Technical Architecture

### **Blockchain Platform**

Tikka is built on the **Stellar blockchain** using **Soroban smart contracts**. Soroban is Stellar's smart contract platform that enables Turing-complete smart contracts written in Rust, providing:

-   **Low Transaction Fees**: Stellar's efficient consensus mechanism
-   **Fast Finality**: Sub-second transaction confirmation
-   **Scalability**: High throughput for decentralized applications
-   **Interoperability**: Native support for Stellar assets and tokens

### **Frontend Stack**

```
React 18 + TypeScript + Vite
├── UI Components (Tailwind CSS)
├── State Management (React Hooks)
├── Routing (React Router)
├── Wallet Integration (Stellar SDK)
└── Contract Integration (Soroban SDK)
```

### **Blockchain Infrastructure**

```
Stellar Network
├── Smart Contracts (Soroban - Rust)
├── Randomness (TBD)
├── Metadata Storage (Supabase)
└── Wallet Integration (Stellar SDK)
```

### **Smart Contract Features**

-   **Raffle Management**: Create, join, and manage raffles
-   **Random Selection**: TBD - Fair winner selection mechanism
-   **Asset Support**: XLM and Stellar asset compatibility
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
├── Purchase tickets with XLM/assets
├── Automatic entry into draw
└── Real-time leaderboard updates
```

### **3. Fair Selection**

```
Raffle Ends → Random Selection (TBD) → Random Winner → Automatic Payout
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
-   Rust (for Soroban contract development)
-   Stellar testnet tokens
-   Stellar SDK

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
# Stellar Network Configuration
VITE_STELLAR_NETWORK=testnet
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# Soroban Contract Configuration
VITE_RAFFLE_CONTRACT_ADDRESS=TBD
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

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
│   │   └── contract.ts       # Soroban contract interface and address
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
Stellar (Soroban): TBD
```

### **Key Functions**

```rust
// Create a new raffle
pub fn create_raffle(
    env: Env,
    description: String,
    end_time: u64,
    max_tickets: u32,
    allow_multiple_tickets: bool,
    ticket_price: i128,
    ticket_asset: Address
) -> u32

// Buy tickets for a raffle
pub fn buy_ticket(env: Env, raffle_id: u32, amount: i128) -> u32

// Get raffle information
pub fn get_raffle_data(env: Env, raffle_id: u32) -> RaffleData
pub fn get_active_raffle_ids(env: Env) -> Vec<u32>
pub fn get_all_raffle_ids(env: Env) -> Vec<u32>

// Get user participation
pub fn get_user_raffle_participation(env: Env, user: Address) -> UserParticipation
```

### **Events**

```rust
event RaffleCreated(raffle_id: u32, creator: Address);
event TicketPurchased(raffle_id: u32, buyer: Address, ticket_id: u32);
event RaffleFinalized(raffle_id: u32, winner: Address, winning_ticket_id: u32);
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
# Build Soroban contract
soroban contract build

# Deploy to Stellar Testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/raffle.wasm \
  --source <your-secret-key> \
  --network testnet

# Deploy to Stellar Mainnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/raffle.wasm \
  --source <your-secret-key> \
  --network mainnet
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
# Run Soroban contract tests
cargo test

# Run with Soroban environment
soroban test
```

---

## 📊 Performance Optimization

### **Frontend Optimizations**

-   **Code Splitting**: Dynamic imports for better loading
-   **Image Optimization**: WebP format with fallbacks
-   **Bundle Analysis**: Regular bundle size monitoring
-   **Caching**: Intelligent data caching strategies

### **Blockchain Optimizations**

-   **Fee Efficiency**: Optimized contract functions
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

-   **Stellar Development Foundation** for providing the infrastructure
-   **Soroban** for powerful smart contract capabilities
-   **React Community** for the amazing ecosystem
-   **Open Source Contributors** for their valuable contributions

---

<div align="center">
  <p>Built with ❤️ by the Tikka Team</p>
  <p>Making raffles fair, transparent, and accessible to everyone</p>
</div>

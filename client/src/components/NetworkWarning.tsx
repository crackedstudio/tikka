/**
 * NetworkWarning Component
 * Goal: Alert users when they are on Mainnet but the app requires Testnet.
 * Part of Issue #120
 */
import { useWalletContext } from "../../providers/WalletProvider";

const NetworkWarning = () => {
  const { isConnected, isWrongNetwork, requiredNetwork, switchNetwork } = useWalletContext();

  // If wallet isn't connected or the network is correct, don't show anything
  if (!isConnected || !isWrongNetwork) {
    return null;
  }

  return (
    <div style={{
      backgroundColor: '#e11d48', // Warning Red
      color: 'white',
      textAlign: 'center',
      padding: '12px',
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      zIndex: 10000,
      fontWeight: '600',
      fontSize: '14px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    }}>
      <span>
         <strong>Wrong Network:</strong> Your wallet is not on {requiredNetwork.toUpperCase()}. 
        Please switch to use the Tikka platform.
      </span>
      
      <button 
        onClick={switchNetwork}
        style={{
          backgroundColor: 'white',
          color: '#e11d48',
          border: 'none',
          padding: '4px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          transition: 'opacity 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
        onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
      >
        Switch Network
      </button>
    </div>
  );
};

export default NetworkWarning;
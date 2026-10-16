import 'react';
import VendorDashboard from '../../components/VendorDashboard';

const CashierPOSPage = ({ user, onLogout }) => {
  return <VendorDashboard user={user} onLogout={onLogout} />;
};

export default CashierPOSPage;

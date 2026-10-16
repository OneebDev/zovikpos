import 'react';
import KitchenDashboard from '../../components/KitchenDashboard';

const KitchenBoardPage = ({ user, onLogout }) => {
  return <KitchenDashboard user={user} onLogout={onLogout} />;
};

export default KitchenBoardPage;

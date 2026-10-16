import 'react';
import { useParams } from 'react-router-dom';
import CustomerDashboard from '../../components/CustomerDashboard';

const CustomerPortalPage = ({ user, onLogout }) => {
  const { tableId: tableIdFromRoute } = useParams();
  return <CustomerDashboard user={user} onLogout={onLogout} tableIdFromRoute={tableIdFromRoute} />;
};

export default CustomerPortalPage;

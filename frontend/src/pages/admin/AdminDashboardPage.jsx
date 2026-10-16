import 'react';
import AdminDashboard from '../../components/AdminDashboard';

const AdminDashboardPage = ({ user, onLogout }) => {
  return <AdminDashboard user={user} onLogout={onLogout} />;
};

export default AdminDashboardPage;

import 'react';
import { useParams } from 'react-router-dom';
import CustomerDashboard from '../../components/CustomerDashboard';

const CustomerPortalPage = ({ user, onLogout }) => {
  const { tableId: tableIdFromRoute } = useParams();
  // Keep the scanned token available even if a browser/webview leaves it URL
  // encoded and Router cannot decode the param consistently.
  const pathnameToken = typeof window !== 'undefined'
    ? window.location.pathname.match(/^\/customer\/table\/([^/]+)\/?$/i)?.[1]
    : '';
  const routeToken = tableIdFromRoute || pathnameToken;
  return <CustomerDashboard user={user} onLogout={onLogout} tableIdFromRoute={routeToken} />;
};

export default CustomerPortalPage;

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  UserCheck,
  UserX,
  Search,
  Download,
  Printer,
  Eye,
  X,
  Trash2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  FileWarning,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  GraduationCap,
  ChevronDown,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { exportToCSV, printPDFReport } from '../../../utils/exportUtils';
import api from '../../../services/api';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

const ALLOWED_BLOCK_REASONS = [
  'Suspected fraudulent activity',
  'Payment dispute or chargeback',
  'Repeated false or abusive complaints',
  'Order abuse or repeated policy violations',
  'Account misuse or identity verification concerns',
  'Security or suspicious activity investigation',
  'Other',
];

const ALLOWED_UNBLOCK_REASONS = [
  'Dispute resolved',
  'Payment issue resolved',
  'Identity verified',
  'Incorrect block reversed',
  'Other',
];

const DISPUTE_CATEGORIES = [
  'Order Issue',
  'Payment Issue',
  'Food Quality / Incorrect Item',
  'Delivery / Delay',
  'Overcharged',
  'Policy Violation',
  'Other',
];

const AdminCustomersView = ({ showToast }) => {
  // Navigation & Core Data
  const [activeTab, setActiveTab] = useState('customers'); // 'customers' | 'disputes'
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    blockedCustomers: 0,
    openDisputes: 0,
    totalDisputes: 0,
  });
  const [loading, setLoading] = useState(true);

  // Customer Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'BLOCKED' | 'STUDENT' | 'NON_STUDENT'
  const [disputeFilter, setDisputeFilter] = useState('ALL'); // 'ALL' | 'WITH_DISPUTES' | 'NO_DISPUTES' | 'OPEN_DISPUTES'
  const [dateFilter, setDateFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'WEEK' | 'MONTH'

  // Selected Customer & Modals
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailModalTab, setDetailModalTab] = useState('orders'); // 'orders' | 'disputes' | 'history'

  // Block Modal State
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [customerToBlock, setCustomerToBlock] = useState(null);
  const [blockReason, setBlockReason] = useState(ALLOWED_BLOCK_REASONS[0]);
  const [customBlockReason, setCustomBlockReason] = useState('');
  const [blockNotes, setBlockNotes] = useState('');
  const [blockConfirmed, setBlockConfirmed] = useState(false);
  const [blockSubmitting, setBlockSubmitting] = useState(false);

  // Unblock Modal State
  const [unblockModalOpen, setUnblockModalOpen] = useState(false);
  const [customerToUnblock, setCustomerToUnblock] = useState(null);
  const [unblockReason, setUnblockReason] = useState(ALLOWED_UNBLOCK_REASONS[0]);
  const [customUnblockReason, setCustomUnblockReason] = useState('');
  const [unblockNotes, setUnblockNotes] = useState('');
  const [unblockConfirmed, setUnblockConfirmed] = useState(false);
  const [unblockSubmitting, setUnblockSubmitting] = useState(false);

  // Centralized Disputes State
  const [disputes, setDisputes] = useState([]);
  const [disputeSummary, setDisputeSummary] = useState({ total: 0, open: 0, underReview: 0, resolved: 0, rejected: 0 });
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [disputeSearch, setDisputeSearch] = useState('');
  const [disputeStatusFilter, setDisputeStatusFilter] = useState('ALL');
  const [disputeCategoryFilter, setDisputeCategoryFilter] = useState('ALL');

  // Dispute Action Modals
  const [updateDisputeModalOpen, setUpdateDisputeModalOpen] = useState(false);
  const [disputeToUpdate, setDisputeToUpdate] = useState(null);
  const [newDisputeStatus, setNewDisputeStatus] = useState('RESOLVED');
  const [disputeResolution, setDisputeResolution] = useState('');
  const [updatingDispute, setUpdatingDispute] = useState(false);

  const [createDisputeModalOpen, setCreateDisputeModalOpen] = useState(false);
  const [newDisputeData, setNewDisputeData] = useState({
    customerEmail: '',
    customerName: '',
    orderNumber: '',
    category: 'Order Issue',
    reason: '',
    description: '',
  });
  const [creatingDispute, setCreatingDispute] = useState(false);

  // Bulk / Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // â”€â”€â”€ Fetch Customers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/customers');
      setCustomers(res.data.customers || []);
      if (res.data.summary) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Fetch customers error:', err);
      if (showToast) showToast('Failed to retrieve customer roster', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // â”€â”€â”€ Fetch Disputes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchDisputes = useCallback(async () => {
    setDisputesLoading(true);
    try {
      const params = {};
      if (disputeStatusFilter && disputeStatusFilter !== 'ALL') params.status = disputeStatusFilter;
      if (disputeCategoryFilter && disputeCategoryFilter !== 'ALL') params.category = disputeCategoryFilter;
      if (disputeSearch.trim()) params.search = disputeSearch.trim();

      const res = await api.get('/admin/disputes', { params });
      setDisputes(res.data.disputes || []);
      if (res.data.summary) {
        setDisputeSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Fetch disputes error:', err);
    } finally {
      setDisputesLoading(false);
    }
  }, [disputeStatusFilter, disputeCategoryFilter, disputeSearch]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (activeTab === 'disputes') {
      fetchDisputes();
    }
  }, [activeTab, fetchDisputes]);

  // â”€â”€â”€ Filtered Customers List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // 1. Text Search (Name, Email, Student Roll Number)
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        c.email?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.rollNumber?.toLowerCase().includes(q);

      // 2. Status Filter
      let matchStatus = true;
      if (statusFilter === 'ACTIVE') matchStatus = c.isActive === true;
      else if (statusFilter === 'BLOCKED') matchStatus = c.isActive === false;
      else if (statusFilter === 'STUDENT') matchStatus = Boolean(c.rollNumber);
      else if (statusFilter === 'NON_STUDENT') matchStatus = !c.rollNumber;

      // 3. Dispute Filter
      let matchDispute = true;
      if (disputeFilter === 'WITH_DISPUTES') matchDispute = Boolean(c.hasDisputes);
      else if (disputeFilter === 'NO_DISPUTES') matchDispute = !c.hasDisputes;
      else if (disputeFilter === 'OPEN_DISPUTES') matchDispute = (c.openDisputesCount || 0) > 0;

      // 4. Date Filter
      let matchDate = true;
      if (dateFilter !== 'ALL' && c.lastOrderDate) {
        const orderTime = new Date(c.lastOrderDate).getTime();
        const now = Date.now();
        if (dateFilter === 'TODAY') {
          matchDate = now - orderTime <= 24 * 60 * 60 * 1000;
        } else if (dateFilter === 'WEEK') {
          matchDate = now - orderTime <= 7 * 24 * 60 * 60 * 1000;
        } else if (dateFilter === 'MONTH') {
          matchDate = now - orderTime <= 30 * 24 * 60 * 60 * 1000;
        }
      } else if (dateFilter !== 'ALL' && !c.lastOrderDate) {
        matchDate = false;
      }

      return matchSearch && matchStatus && matchDispute && matchDate;
    });
  }, [customers, searchTerm, statusFilter, disputeFilter, dateFilter]);

  // â”€â”€â”€ Selection Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hasSelectedCustomers = selectionMode && selectedCustomerIds.size > 0;
  const mobileActionWidth = 'mobile-action-third';

  const toggleSelectCustomer = (id) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCustomerIds.size === filteredCustomers.length) {
      setSelectedCustomerIds(new Set());
    } else {
      setSelectedCustomerIds(new Set(filteredCustomers.map((c) => c.id)));
    }
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedCustomerIds(new Set());
    setSelectionMode((active) => !active);
  };

  const handleBulkDelete = () => {
    if (selectedCustomerIds.size === 0) return;
    setIsBulkDeleting(true);
    setCustomerToDelete(null);
    setDeleteModalOpen(true);
  };

  // â”€â”€â”€ Block Customer Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleOpenBlockModal = (customer) => {
    setCustomerToBlock(customer);
    setBlockReason(ALLOWED_BLOCK_REASONS[0]);
    setCustomBlockReason('');
    setBlockNotes('');
    setBlockConfirmed(false);
    setBlockModalOpen(true);
  };

  const handleConfirmBlock = async (e) => {
    if (e) e.preventDefault();
    if (!customerToBlock) return;
    if (blockReason === 'Other' && !customBlockReason.trim()) {
      if (showToast) showToast('Please provide a written explanation for Other reason', 'error');
      return;
    }
    if (!blockConfirmed) {
      if (showToast) showToast('Please confirm the block action before saving', 'error');
      return;
    }

    setBlockSubmitting(true);
    try {
      const res = await api.put(`/admin/customers/${customerToBlock.id}/block`, {
        reason: blockReason,
        customExplanation: customBlockReason.trim(),
        notes: blockNotes.trim(),
      });

      if (showToast) showToast(res.data?.message || 'Customer account has been restricted.');
      setBlockModalOpen(false);
      setCustomerToBlock(null);

      // Refresh customers to get synchronized block status & audit history
      await fetchCustomers();

      if (selectedCustomer?.id === customerToBlock.id) {
        // Update currently viewed detail modal if open
        setSelectedCustomer((prev) => (prev ? { ...prev, isActive: false, isBlocked: true } : null));
      }
    } catch (err) {
      console.error('Block customer error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to block customer account', 'error');
    } finally {
      setBlockSubmitting(false);
    }
  };

  // â”€â”€â”€ Unblock Customer Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleOpenUnblockModal = (customer) => {
    setCustomerToUnblock(customer);
    setUnblockReason(ALLOWED_UNBLOCK_REASONS[0]);
    setCustomUnblockReason('');
    setUnblockNotes('');
    setUnblockConfirmed(false);
    setUnblockModalOpen(true);
  };

  const handleConfirmUnblock = async (e) => {
    if (e) e.preventDefault();
    if (!customerToUnblock) return;
    if (unblockReason === 'Other' && !customUnblockReason.trim()) {
      if (showToast) showToast('Please provide a written explanation for Other reason', 'error');
      return;
    }
    if (!unblockConfirmed) {
      if (showToast) showToast('Please confirm the unblock action before saving', 'error');
      return;
    }

    setUnblockSubmitting(true);
    try {
      const res = await api.put(`/admin/customers/${customerToUnblock.id}/unblock`, {
        reason: unblockReason,
        customExplanation: customUnblockReason.trim(),
        notes: unblockNotes.trim(),
      });

      if (showToast) showToast(res.data?.message || 'Customer account has been unblocked.');
      setUnblockModalOpen(false);
      setCustomerToUnblock(null);

      await fetchCustomers();

      if (selectedCustomer?.id === customerToUnblock.id) {
        setSelectedCustomer((prev) => (prev ? { ...prev, isActive: true, isBlocked: false } : null));
      }
    } catch (err) {
      console.error('Unblock customer error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to unblock customer account', 'error');
    } finally {
      setUnblockSubmitting(false);
    }
  };

  // â”€â”€â”€ Dispute Status Update Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleOpenUpdateDispute = (dispute) => {
    setDisputeToUpdate(dispute);
    setNewDisputeStatus(dispute.status === 'OPEN' ? 'UNDER_REVIEW' : 'RESOLVED');
    setDisputeResolution(dispute.resolution || '');
    setUpdateDisputeModalOpen(true);
  };

  const handleSaveDisputeStatus = async (e) => {
    if (e) e.preventDefault();
    if (!disputeToUpdate) return;

    setUpdatingDispute(true);
    try {
      const res = await api.put(`/admin/disputes/${disputeToUpdate.id}`, {
        status: newDisputeStatus,
        resolution: disputeResolution.trim(),
      });

      if (showToast) showToast(res.data?.message || 'Dispute status updated.');
      setUpdateDisputeModalOpen(false);
      setDisputeToUpdate(null);
      fetchDisputes();
      fetchCustomers();
    } catch (err) {
      console.error('Update dispute error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to update dispute status', 'error');
    } finally {
      setUpdatingDispute(false);
    }
  };

  // â”€â”€â”€ Create Dispute Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSaveNewDispute = async (e) => {
    if (e) e.preventDefault();
    if (!newDisputeData.customerEmail.trim()) {
      if (showToast) showToast('Customer email is required', 'error');
      return;
    }
    if (!newDisputeData.reason.trim()) {
      if (showToast) showToast('Dispute title / reason is required', 'error');
      return;
    }
    if (!newDisputeData.description.trim()) {
      if (showToast) showToast('Description is required', 'error');
      return;
    }

    setCreatingDispute(true);
    try {
      const res = await api.post('/admin/disputes', newDisputeData);
      if (showToast) showToast(res.data?.message || 'Dispute recorded successfully.');
      setCreateDisputeModalOpen(false);
      setNewDisputeData({
        customerEmail: '',
        customerName: '',
        orderNumber: '',
        category: 'Order Issue',
        reason: '',
        description: '',
      });
      fetchDisputes();
      fetchCustomers();
    } catch (err) {
      console.error('Create dispute error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to record dispute', 'error');
    } finally {
      setCreatingDispute(false);
    }
  };

  // â”€â”€â”€ Export CSV & PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleExportCSV = () => {
    const csvData = filteredCustomers.map((c) => ({
      Name: c.name,
      Email: c.email,
      StudentRollNo: c.rollNumber || 'N/A',
      TotalOrders: c.totalOrders,
      PaidOrdersCount: c.paidOrdersCount,
      TotalSpent: c.totalSpent,
      LastOrderDate: c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleString() : 'No Orders Yet',
      AccountStatus: c.isActive ? 'Active' : 'Blocked',
      Disputes: c.hasDisputes ? `${c.openDisputesCount || 0} Open (${c.disputes?.length || 0} Total)` : 'None',
    }));

    exportToCSV(`customer_roster_${Date.now()}.csv`, csvData, [
      { key: 'Name', label: 'Customer Name' },
      { key: 'Email', label: 'Email' },
      { key: 'StudentRollNo', label: 'Student Roll No.' },
      { key: 'TotalOrders', label: 'Total Orders' },
      { key: 'PaidOrdersCount', label: 'Paid Orders' },
      { key: 'TotalSpent', label: 'Total Spent (Rs.)' },
      { key: 'LastOrderDate', label: 'Last Order Date' },
      { key: 'AccountStatus', label: 'Status' },
      { key: 'Disputes', label: 'Disputes' },
    ]);
  };

  const handleExportPDF = () => {
    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Customer Name</th>
            <th>Email</th>
            <th>Student Roll No.</th>
            <th>Total Orders</th>
            <th>Total Spent (Rs.)</th>
            <th>Status</th>
            <th>Disputes</th>
          </tr>
        </thead>
        <tbody>
          ${filteredCustomers
            .map(
              (c) => `
            <tr>
              <td><strong>${c.name}</strong></td>
              <td>${c.email}</td>
              <td>${c.rollNumber || 'N/A'}</td>
              <td>${c.totalOrders} (${c.paidOrdersCount} Paid)</td>
              <td>Rs. ${Number(c.totalSpent || 0).toFixed(2)}</td>
              <td><span class="badge ${c.isActive ? 'badge-success' : 'badge-danger'}">${c.isActive ? 'Active' : 'Blocked'}</span></td>
              <td>${c.openDisputesCount > 0 ? `<span class="badge badge-warning">${c.openDisputesCount} Open</span>` : 'Clean'}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
    printPDFReport('Customer Analytics & Roster Report', tableHtml);
  };

  return (
    <div className="space-y-6">
      {/* â”€â”€â”€ Top Header Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 glass-card p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="min-w-0 text-lg font-extrabold leading-tight text-[var(--text-main)] font-display sm:text-xl">
              Customer Management &amp; Disputes
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
              Admin Control
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Student roll verification, spend analytics, account safety restrictions, and centralized dispute resolution.
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 lg:w-auto lg:shrink-0 lg:justify-end lg:overflow-visible">
          <button
            onClick={() => {
              fetchCustomers();
              if (activeTab === 'disputes') fetchDisputes();
            }}
            className="p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-orange-500/40 text-[var(--text-muted)] hover:text-orange-400 transition-all cursor-pointer icon-btn"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading || disputesLoading ? 'animate-spin text-orange-400' : ''}`} />
          </button>

          {activeTab === 'customers' && (
            <>
              <BulkSelectionModeButton
                active={selectionMode}
                onClick={toggleSelectionMode}
                selectedCount={selectedCustomerIds.size}
                mobileLabel="Select"
                mobileActiveLabel="Done"
                className={`${mobileActionWidth} h-10 justify-center px-1.5 text-[10px] sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-xs`}
              />
              {hasSelectedCustomers && (
                <button
                  onClick={handleBulkDelete}
                  className={`flex h-10 ${mobileActionWidth} shrink-0 items-center justify-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 px-1 text-[10px] font-bold text-rose-400 shadow-md transition-all hover:bg-rose-500/20 cursor-pointer sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-xs`}
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="whitespace-nowrap">
                    <span className="sm:hidden">Delete</span>
                    <span className="hidden sm:inline">Delete Selected ({selectedCustomerIds.size})</span>
                  </span>
                </button>
              )}
              <button
                onClick={handleExportCSV}
                className={`flex h-10 ${mobileActionWidth} shrink-0 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-emerald-500 cursor-pointer sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-xs`}
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-nowrap"><span className="sm:hidden">CSV</span><span className="hidden sm:inline">Export CSV</span></span>
              </button>
              <button
                onClick={handleExportPDF}
                className={`flex h-10 ${mobileActionWidth} shrink-0 items-center justify-center gap-1 rounded-xl bg-orange-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-orange-500 cursor-pointer sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-xs`}
              >
                <Printer className="h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-nowrap"><span className="sm:hidden">PDF</span><span className="hidden sm:inline">Export PDF</span></span>
              </button>
            </>
          )}

          {activeTab === 'disputes' && (
            <button
              onClick={() => setCreateDisputeModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-lg transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Dispute</span>
            </button>
          )}
        </div>
      </div>

      {/* â”€â”€â”€ Compact Summary Cards (Requirement 1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Customers */}
        <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl shadow-md hover:border-orange-500/30 transition-all flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
              Total Customers
            </span>
            <span className="text-xl sm:text-2xl font-black text-[var(--text-main)] font-mono mt-1 block">
              {summary.totalCustomers}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">Registered canteen accounts</span>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Active Customers */}
        <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl shadow-md hover:border-emerald-500/30 transition-all flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
              Active Customers
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1 block">
              {summary.activeCustomers}
            </span>
            <span className="text-[10px] text-emerald-500/80 mt-0.5 block">Eligible to order &amp; dine</span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Blocked Customers */}
        <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl shadow-md hover:border-rose-500/30 transition-all flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
              Blocked Accounts
            </span>
            <span className="text-xl sm:text-2xl font-black text-rose-400 font-mono mt-1 block">
              {summary.blockedCustomers}
            </span>
            <span className="text-[10px] text-rose-400/80 mt-0.5 block">Restricted by admin</span>
          </div>
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20 shrink-0">
            <UserX className="w-5 h-5" />
          </div>
        </div>

        {/* Open Disputes */}
        <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl shadow-md hover:border-amber-500/30 transition-all flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
              Open Disputes
            </span>
            <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono mt-1 block">
              {summary.openDisputes}
            </span>
            <span className="text-[10px] text-amber-400/80 mt-0.5 block">Requires admin review</span>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* â”€â”€â”€ Navigation Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex border-b border-[var(--border-color)] gap-6">
        <button
          onClick={() => setActiveTab('customers')}
          className={`pb-3 text-xs sm:text-sm font-extrabold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'customers'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Customer Roster &amp; Profiles</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--card-bg)] border border-[var(--border-color)]">
            {filteredCustomers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('disputes')}
          className={`pb-3 text-xs sm:text-sm font-extrabold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'disputes'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Centralized Disputes &amp; Complaints</span>
          {summary.openDisputes > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {summary.openDisputes} Open
            </span>
          )}
        </button>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          TAB 1: CUSTOMERS ROSTER
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'customers' && (
        <div className="space-y-4">
          {/* Search & Comprehensive Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[var(--card-bg)]/30 border border-[var(--border-color)] p-4 rounded-2xl">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search email, name, or roll no..."
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Account Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">All Account Statuses</option>
                <option value="ACTIVE">Active Accounts Only</option>
                <option value="BLOCKED">Blocked Accounts Only</option>
                <option value="STUDENT">UIT Student Verified Only</option>
                <option value="NON_STUDENT">Non-Student Accounts Only</option>
              </select>
            </div>

            {/* Dispute Filter */}
            <div>
              <select
                value={disputeFilter}
                onChange={(e) => setDisputeFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">All Dispute States</option>
                <option value="OPEN_DISPUTES">With Active / Open Disputes</option>
                <option value="WITH_DISPUTES">With Any Recorded Disputes</option>
                <option value="NO_DISPUTES">Clean (No Disputes)</option>
              </select>
            </div>

            {/* Last Order Activity Filter */}
            <div>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">All Order Dates</option>
                <option value="TODAY">Ordered Today (Last 24h)</option>
                <option value="WEEK">Ordered Past 7 Days</option>
                <option value="MONTH">Ordered Past 30 Days</option>
              </select>
            </div>
          </div>

          {/* Customer Roster Table */}
          <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs font-bold text-[var(--text-muted)]">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                <span>Loading Customer Analytics...</span>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)]">
                No customer accounts match your search and filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                      {selectionMode && (
                        <th className="p-4 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filteredCustomers.length > 0 && selectedCustomerIds.size === filteredCustomers.length}
                            onChange={toggleSelectAll}
                            className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="p-4">Customer Name &amp; Student ID</th>
                      <th className="p-4">Email Address</th>
                      <th className="p-4">Total Orders</th>
                      <th className="p-4">Total Spending</th>
                      <th className="p-4">Last Order</th>
                      <th className="p-4">Disputes</th>
                      <th className="p-4">Account Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {filteredCustomers.map((c) => {
                      const isChecked = selectedCustomerIds.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-[var(--bg-color)]/40 transition-colors ${
                            isChecked ? 'bg-orange-500/5' : ''
                          } ${!c.isActive ? 'bg-rose-500/[0.02]' : ''}`}
                        >
                          {selectionMode && (
                            <td className="p-4 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectCustomer(c.id)}
                                className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500 cursor-pointer"
                              />
                            </td>
                          )}

                          {/* Customer Name & Student Roll */}
                          <td className="p-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-[var(--text-main)]">{c.name}</span>
                              {c.rollNumber ? (
                                <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-mono font-bold text-orange-400">
                                  <GraduationCap className="w-3 h-3 shrink-0" />
                                  <span>{c.rollNumber}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--text-muted)]">General Guest</span>
                              )}
                            </div>
                          </td>

                          {/* Email Address */}
                          <td className="p-4 whitespace-nowrap font-mono text-[var(--text-muted)]">
                            {c.email}
                          </td>

                          {/* Orders */}
                          <td className="p-4 whitespace-nowrap">
                            <span className="font-bold text-[var(--text-main)]">{c.totalOrders} orders</span>
                            <span className="text-[10px] text-[var(--text-muted)] block">
                              {c.paidOrdersCount} verified paid
                            </span>
                          </td>

                          {/* Spending */}
                          <td className="p-4 whitespace-nowrap font-mono font-extrabold text-emerald-400">
                            Rs. {Number(c.totalSpent || 0).toFixed(2)}
                          </td>

                          {/* Last Order Date */}
                          <td className="p-4 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                            {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleString() : 'No orders yet'}
                          </td>

                          {/* Disputes Column */}
                          <td className="p-4 whitespace-nowrap">
                            {c.openDisputesCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                <AlertCircle className="w-3 h-3" />
                                <span>{c.openDisputesCount} Open</span>
                              </span>
                            ) : c.hasDisputes ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-500/20 text-[var(--text-muted)] border border-slate-500/30">
                                <span>{c.disputes?.length} Resolved</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)]">None</span>
                            )}
                          </td>

                          {/* Account Status Badge */}
                          <td className="p-4 whitespace-nowrap">
                            {c.isActive ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>ACTIVE</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                <ShieldAlert className="w-3 h-3" />
                                <span>BLOCKED</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-4 text-right whitespace-nowrap">
                            <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                              {/* View Details */}
                              <button
                                onClick={() => {
                                  setSelectedCustomer(c);
                                  setDetailModalTab('orders');
                                }}
                                className="px-2.5 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                title="View Customer Details & History"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Details</span>
                              </button>

                              {/* Block / Unblock Action Button */}
                              {c.isActive ? (
                                <button
                                  onClick={() => handleOpenBlockModal(c)}
                                  className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                  title="Restrict / Block Customer Account"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>Block</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleOpenUnblockModal(c)}
                                  className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                  title="Lift Block & Unblock Customer"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Unblock</span>
                                </button>
                              )}

                              {/* Delete Customer */}
                              <button
                                onClick={() => {
                                  setIsBulkDeleting(false);
                                  setCustomerToDelete(c);
                                  setDeleteModalOpen(true);
                                }}
                                title="Delete / Archive Customer"
                                className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/20 transition-all cursor-pointer icon-btn"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          TAB 2: CENTRALIZED DISPUTES MANAGEMENT (Requirement 5)
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'disputes' && (
        <div className="space-y-4">
          {/* Dispute Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-xl text-center">
              <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold block">Total Disputes</span>
              <strong className="text-base font-extrabold text-[var(--text-main)] font-mono">{disputeSummary.total}</strong>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
              <span className="text-[10px] text-amber-400 uppercase font-bold block">Open</span>
              <strong className="text-base font-extrabold text-amber-400 font-mono">{disputeSummary.open}</strong>
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
              <span className="text-[10px] text-blue-400 uppercase font-bold block">Under Review</span>
              <strong className="text-base font-extrabold text-blue-400 font-mono">{disputeSummary.underReview}</strong>
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
              <span className="text-[10px] text-emerald-400 uppercase font-bold block">Resolved</span>
              <strong className="text-base font-extrabold text-emerald-400 font-mono">{disputeSummary.resolved}</strong>
            </div>
            <div className="p-3 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold block">Rejected</span>
              <strong className="text-base font-extrabold text-[var(--text-muted)] font-mono">{disputeSummary.rejected}</strong>
            </div>
          </div>

          {/* Dispute Search & Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[var(--card-bg)]/30 border border-[var(--border-color)] p-4 rounded-2xl">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
              <input
                type="text"
                value={disputeSearch}
                onChange={(e) => setDisputeSearch(e.target.value)}
                placeholder="Search email, order #, or keyword..."
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <select
                value={disputeStatusFilter}
                onChange={(e) => setDisputeStatusFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">All Dispute Statuses</option>
                <option value="OPEN">Open Only</option>
                <option value="UNDER_REVIEW">Under Review Only</option>
                <option value="RESOLVED">Resolved Only</option>
                <option value="REJECTED">Rejected Only</option>
              </select>
            </div>

            <div>
              <select
                value={disputeCategoryFilter}
                onChange={(e) => setDisputeCategoryFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">All Categories</option>
                {DISPUTE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Disputes Table */}
          <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
            {disputesLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs font-bold text-[var(--text-muted)]">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                <span>Loading Disputes &amp; Complaints...</span>
              </div>
            ) : disputes.length === 0 ? (
              <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)] space-y-2">
                <p>No disputes recorded matching the selected filters.</p>
                <button
                  onClick={() => setCreateDisputeModalOpen(true)}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Record First Dispute
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                      <th className="p-4">Customer</th>
                      <th className="p-4">Order #</th>
                      <th className="p-4">Category &amp; Reason</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Logged At</th>
                      <th className="p-4">Resolution Notes</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {disputes.map((d) => (
                      <tr key={d.id} className="hover:bg-[var(--bg-color)]/40 transition-colors">
                        <td className="p-4">
                          <strong className="text-[var(--text-main)] block">{d.customerName || 'Customer'}</strong>
                          <span className="text-[11px] font-mono text-[var(--text-muted)]">{d.customerEmail}</span>
                        </td>
                        <td className="p-4 font-mono font-bold text-orange-400">
                          {d.orderNumber || 'General / Non-Order'}
                        </td>
                        <td className="p-4 max-w-xs">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-muted)] block w-fit mb-1">
                            {d.category}
                          </span>
                          <strong className="text-[var(--text-main)] block">{d.reason}</strong>
                          <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mt-0.5">{d.description}</p>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          {d.status === 'OPEN' && (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              OPEN
                            </span>
                          )}
                          {d.status === 'UNDER_REVIEW' && (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              UNDER REVIEW
                            </span>
                          )}
                          {d.status === 'RESOLVED' && (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              RESOLVED
                            </span>
                          )}
                          {d.status === 'REJECTED' && (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-slate-500/20 text-[var(--text-muted)] border border-slate-500/30">
                              REJECTED
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                          {d.createdAt ? new Date(d.createdAt).toLocaleString() : 'N/A'}
                        </td>
                        <td className="p-4 text-[11px] max-w-xs">
                          {d.resolution ? (
                            <div>
                              <p className="text-[var(--text-main)] italic">"{d.resolution}"</p>
                              <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">
                                By {d.resolvedBy || 'Admin'} {d.resolvedAt ? `Â· ${new Date(d.resolvedAt).toLocaleDateString()}` : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[var(--text-muted)]">Pending resolution</span>
                          )}
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleOpenUpdateDispute(d)}
                            className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl font-bold transition-all text-xs cursor-pointer"
                          >
                            Update Status
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MODAL 1: CUSTOMER VIEW DETAILS (Requirement 3)
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-[var(--glass-bg-subtle)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-[var(--border-color)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-extrabold text-[var(--text-main)] font-display">{selectedCustomer.name}</h3>
                  {selectedCustomer.isActive ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      ACTIVE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      BLOCKED
                    </span>
                  )}
                  {selectedCustomer.rollNumber && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      UIT Verified
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{selectedCustomer.email}</p>
                {selectedCustomer.rollNumber && (
                  <p className="text-xs font-mono text-orange-400 mt-0.5">Roll No: {selectedCustomer.rollNumber}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer icon-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overview Metric Boxes */}
            <div className="grid grid-cols-4 gap-3 text-center text-xs">
              <div className="p-3 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase block">Total Orders</span>
                <strong className="text-base font-extrabold text-[var(--text-main)] block">{selectedCustomer.totalOrders}</strong>
              </div>
              <div className="p-3 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase block">Paid Orders</span>
                <strong className="text-base font-extrabold text-orange-400 block">{selectedCustomer.paidOrdersCount}</strong>
              </div>
              <div className="p-3 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase block">Total Spent</span>
                <strong className="text-base font-mono font-extrabold text-emerald-400 block">
                  Rs. {Number(selectedCustomer.totalSpent || 0).toFixed(2)}
                </strong>
              </div>
              <div className="p-3 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase block">Disputes</span>
                <strong className={`text-base font-mono font-extrabold block ${selectedCustomer.openDisputesCount > 0 ? 'text-amber-400' : 'text-[var(--text-main)]'}`}>
                  {selectedCustomer.disputes?.length || 0}
                </strong>
              </div>
            </div>

            {/* Sub-tabs inside Details Modal */}
            <div className="flex border-b border-[var(--border-color)] gap-4 text-xs font-bold">
              <button
                onClick={() => setDetailModalTab('orders')}
                className={`pb-2 border-b-2 transition-all cursor-pointer ${
                  detailModalTab === 'orders'
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Recent Orders ({selectedCustomer.recentOrders?.length || 0})
              </button>
              <button
                onClick={() => setDetailModalTab('disputes')}
                className={`pb-2 border-b-2 transition-all cursor-pointer ${
                  detailModalTab === 'disputes'
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Disputes &amp; Complaints ({selectedCustomer.disputes?.length || 0})
              </button>
              <button
                onClick={() => setDetailModalTab('history')}
                className={`pb-2 border-b-2 transition-all cursor-pointer ${
                  detailModalTab === 'history'
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Block / Unblock History ({selectedCustomer.blockHistory?.length || 0})
              </button>
            </div>

            {/* Sub-tab 1: Orders */}
            {detailModalTab === 'orders' && (
              <div className="space-y-3">
                <div className="divide-y divide-[var(--border-color)] bg-[var(--bg-color)]/40 rounded-2xl border border-[var(--border-color)] text-xs">
                  {selectedCustomer.recentOrders?.map((order) => (
                    <div key={order.id} className="p-3 flex justify-between items-center">
                      <div>
                        <strong className="text-orange-400 font-mono block">{order.orderNumber}</strong>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {new Date(order.createdAt).toLocaleString()} Â· {order.paymentStatus}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-400 block">Rs. {order.total?.toFixed(2)}</span>
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{order.status}</span>
                      </div>
                    </div>
                  ))}
                  {(!selectedCustomer.recentOrders || selectedCustomer.recentOrders.length === 0) && (
                    <p className="p-4 text-center text-xs text-[var(--text-muted)]">No recent orders recorded.</p>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 2: Disputes */}
            {detailModalTab === 'disputes' && (
              <div className="space-y-3">
                <div className="divide-y divide-[var(--border-color)] bg-[var(--bg-color)]/40 rounded-2xl border border-[var(--border-color)] text-xs">
                  {selectedCustomer.disputes?.map((d) => (
                    <div key={d.id} className="p-3 space-y-1">
                      <div className="flex justify-between items-center">
                        <strong className="text-[var(--text-main)]">{d.reason}</strong>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                          {d.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">{d.description}</p>
                      {d.resolution && (
                        <p className="text-[11px] text-emerald-400 italic">Resolution: {d.resolution}</p>
                      )}
                      <span className="text-[10px] text-[var(--text-muted)] block">
                        Logged on {new Date(d.createdAt).toLocaleString()} {d.orderNumber ? `Â· Order: ${d.orderNumber}` : ''}
                      </span>
                    </div>
                  ))}
                  {(!selectedCustomer.disputes || selectedCustomer.disputes.length === 0) && (
                    <p className="p-4 text-center text-xs text-[var(--text-muted)]">No recorded disputes for this customer.</p>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 3: Block / Unblock Audit History */}
            {detailModalTab === 'history' && (
              <div className="space-y-3">
                <div className="divide-y divide-[var(--border-color)] bg-[var(--bg-color)]/40 rounded-2xl border border-[var(--border-color)] text-xs">
                  {selectedCustomer.blockHistory?.map((h) => (
                    <div key={h.id} className="p-3 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${h.action === 'STUDENT_BLOCKED' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {h.action === 'STUDENT_BLOCKED' ? 'ACCOUNT RESTRICTED' : 'RESTRICTION LIFTED'}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">{new Date(h.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-main)] font-semibold">Reason: {h.reason}</p>
                      {h.notes && <p className="text-[11px] text-[var(--text-muted)]">Notes: {h.notes}</p>}
                      <span className="text-[10px] text-[var(--text-muted)] block">Action logged by: {h.actingAdmin}</span>
                    </div>
                  ))}
                  {(!selectedCustomer.blockHistory || selectedCustomer.blockHistory.length === 0) && (
                    <p className="p-4 text-center text-xs text-[var(--text-muted)]">No block / unblock audit events recorded.</p>
                  )}
                </div>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-[var(--border-color)]">
              <div className="flex gap-2">
                {selectedCustomer.isActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenBlockModal(selectedCustomer);
                    }}
                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Block Customer</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenUnblockModal(selectedCustomer);
                    }}
                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Unblock Customer</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCustomerToDelete(selectedCustomer);
                    setDeleteModalOpen(true);
                  }}
                  className="px-3 py-2 bg-slate-500/10 hover:bg-slate-500/20 text-[var(--text-muted)] hover:text-rose-400 rounded-xl text-xs font-bold border border-transparent transition-all cursor-pointer icon-btn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-5 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] rounded-xl text-xs font-bold border border-[var(--border-color)] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MODAL 2: BLOCK CUSTOMER MODAL (Requirement 4)
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {blockModalOpen && customerToBlock && (
        <div className="fixed inset-0 z-50 bg-[var(--glass-bg-subtle)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-rose-500/30 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex justify-between items-start border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-lg font-extrabold text-[var(--text-main)]">Restrict Customer Account</h3>
              </div>
              <button
                onClick={() => setBlockModalOpen(false)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
              <p>
                Blocking restricts <strong className="text-white">{customerToBlock.name}</strong> ({customerToBlock.email}) from dining sessions and OTP order placement. Existing past order records remain safely archived.
              </p>
            </div>

            <form onSubmit={handleConfirmBlock} className="space-y-4 text-xs">
              {/* Reason Dropdown (Required) */}
              <div>
                <label className="font-bold text-[var(--text-main)] block mb-1">
                  Required Blocking Reason <span className="text-rose-400">*</span>
                </label>
                <select
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-rose-500 font-medium"
                  required
                >
                  {ALLOWED_BLOCK_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Custom Explanation (Required when 'Other' selected) */}
              {blockReason === 'Other' && (
                <div>
                  <label className="font-bold text-[var(--text-main)] block mb-1">
                    Specific Written Explanation <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={customBlockReason}
                    onChange={(e) => setCustomBlockReason(e.target.value)}
                    placeholder="Describe specific grounds for restricting this student/customer account..."
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-rose-500/40 rounded-xl text-[var(--text-main)] focus:outline-none focus:border-rose-500"
                    required
                  />
                </div>
              )}

              {/* Additional Notes */}
              <div>
                <label className="font-bold text-[var(--text-main)] block mb-1">
                  Internal Administrative Notes <span className="text-[var(--text-muted)] font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={blockNotes}
                  onChange={(e) => setBlockNotes(e.target.value)}
                  placeholder="Additional context, incident reference #, or staff note..."
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Required Confirmation Checkbox */}
              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="confirm-block-checkbox"
                  checked={blockConfirmed}
                  onChange={(e) => setBlockConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border-color)] text-rose-600 focus:ring-rose-500 cursor-pointer"
                  required
                />
                <label htmlFor="confirm-block-checkbox" className="text-[11px] text-[var(--text-muted)] cursor-pointer">
                  I confirm that I intend to block this customer. This action will be logged in the permanent audit system.
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setBlockModalOpen(false)}
                  className="px-4 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={blockSubmitting || !blockConfirmed}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {blockSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  <span>Confirm Account Block</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MODAL 3: UNBLOCK CUSTOMER MODAL (Requirement 4)
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {unblockModalOpen && customerToUnblock && (
        <div className="fixed inset-0 z-50 bg-[var(--glass-bg-subtle)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-emerald-500/30 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex justify-between items-start border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-lg font-extrabold text-[var(--text-main)]">Unblock Customer Account</h3>
              </div>
              <button
                onClick={() => setUnblockModalOpen(false)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
              <p>
                Lifting restriction for <strong className="text-white">{customerToUnblock.name}</strong> ({customerToUnblock.email}). The customer will be able to start sessions and place orders again.
              </p>
            </div>

            <form onSubmit={handleConfirmUnblock} className="space-y-4 text-xs">
              {/* Reason Dropdown (Required) */}
              <div>
                <label className="font-bold text-[var(--text-main)] block mb-1">
                  Required Unblock Reason <span className="text-emerald-400">*</span>
                </label>
                <select
                  value={unblockReason}
                  onChange={(e) => setUnblockReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-emerald-500 font-medium"
                  required
                >
                  {ALLOWED_UNBLOCK_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Custom Explanation (Required when 'Other' selected) */}
              {unblockReason === 'Other' && (
                <div>
                  <label className="font-bold text-[var(--text-main)] block mb-1">
                    Specific Written Explanation <span className="text-emerald-400">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={customUnblockReason}
                    onChange={(e) => setCustomUnblockReason(e.target.value)}
                    placeholder="Describe specific grounds for lifting account restrictions..."
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-emerald-500/40 rounded-xl text-[var(--text-main)] focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="font-bold text-[var(--text-main)] block mb-1">
                  Administrative Notes <span className="text-[var(--text-muted)] font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={unblockNotes}
                  onChange={(e) => setUnblockNotes(e.target.value)}
                  placeholder="Additional context or notes for staff audit log..."
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Confirmation Checkbox */}
              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="confirm-unblock-checkbox"
                  checked={unblockConfirmed}
                  onChange={(e) => setUnblockConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border-color)] text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  required
                />
                <label htmlFor="confirm-unblock-checkbox" className="text-[11px] text-[var(--text-muted)] cursor-pointer">
                  I confirm that this customer's account restrictions should be lifted. This action will be recorded in the audit trail.
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setUnblockModalOpen(false)}
                  className="px-4 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={unblockSubmitting || !unblockConfirmed}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unblockSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Confirm Account Unblock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MODAL 4: UPDATE DISPUTE STATUS (Requirement 5)
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {updateDisputeModalOpen && disputeToUpdate && (
        <div className="fixed inset-0 z-50 bg-[var(--glass-bg-subtle)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex justify-between items-start border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--text-main)]">Update Dispute / Complaint</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Customer: {disputeToUpdate.customerEmail} {disputeToUpdate.orderNumber ? `Â· Order #${disputeToUpdate.orderNumber}` : ''}
                </p>
              </div>
              <button
                onClick={() => setUpdateDisputeModalOpen(false)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)] text-xs space-y-1">
              <strong className="text-[var(--text-main)] block">{disputeToUpdate.reason}</strong>
              <p className="text-[var(--text-muted)]">{disputeToUpdate.description}</p>
            </div>

            <form onSubmit={handleSaveDisputeStatus} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[var(--text-main)] block mb-1">New Dispute Status</label>
                <select
                  value={newDisputeStatus}
                  onChange={(e) => setNewDisputeStatus(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-medium"
                >
                  <option value="OPEN">OPEN (Awaiting Attention)</option>
                  <option value="UNDER_REVIEW">UNDER REVIEW (Investigation in Progress)</option>
                  <option value="RESOLVED">RESOLVED (Customer Issue Resolved)</option>
                  <option value="REJECTED">REJECTED (Invalid / Policy Complaint Rejected)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[var(--text-main)] block mb-1">Resolution Reason / Notes</label>
                <textarea
                  rows={3}
                  value={disputeResolution}
                  onChange={(e) => setDisputeResolution(e.target.value)}
                  placeholder="Record what action was taken, refund details, replacement item, or why rejected..."
                  className="w-full px-3 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setUpdateDisputeModalOpen(false)}
                  className="px-4 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingDispute}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {updatingDispute && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Status</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MODAL 5: RECORD NEW DISPUTE MODAL (Requirement 5)
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {createDisputeModalOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--glass-bg-subtle)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex justify-between items-start border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--text-main)]">Record Customer Dispute / Complaint</h3>
                <p className="text-xs text-[var(--text-muted)]">Log a counter report or customer-submitted complaint</p>
              </div>
              <button
                onClick={() => setCreateDisputeModalOpen(false)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewDispute} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-main)] block mb-1">
                    Customer Email <span className="text-orange-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={newDisputeData.customerEmail}
                    onChange={(e) => setNewDisputeData({ ...newDisputeData, customerEmail: e.target.value })}
                    placeholder="student@students.uitu.edu.pk"
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-main)] block mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={newDisputeData.customerName}
                    onChange={(e) => setNewDisputeData({ ...newDisputeData, customerName: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-main)] block mb-1">Related Order # (Optional)</label>
                  <input
                    type="text"
                    value={newDisputeData.orderNumber}
                    onChange={(e) => setNewDisputeData({ ...newDisputeData, orderNumber: e.target.value })}
                    placeholder="e.g. ORD-2026-732227"
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-main)] block mb-1">Dispute Category</label>
                  <select
                    value={newDisputeData.category}
                    onChange={(e) => setNewDisputeData({ ...newDisputeData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  >
                    {DISPUTE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--text-main)] block mb-1">
                  Reason / Short Title <span className="text-orange-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDisputeData.reason}
                  onChange={(e) => setNewDisputeData({ ...newDisputeData, reason: e.target.value })}
                  placeholder="e.g. Missing extra cheese on burger / charged twice"
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--text-main)] block mb-1">
                  Detailed Complaint Description <span className="text-orange-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={newDisputeData.description}
                  onChange={(e) => setNewDisputeData({ ...newDisputeData, description: e.target.value })}
                  placeholder="Provide complete facts reported by the student / customer..."
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setCreateDisputeModalOpen(false)}
                  className="px-4 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingDispute}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {creatingDispute && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Submit Dispute</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* â”€â”€â”€ Global Delete Confirmation Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setCustomerToDelete(null);
        }}
        onConfirm={async () => {
          setDeleteLoading(true);
          try {
            if (isBulkDeleting) {
              const res = await api.delete('/admin/customers/bulk', {
                data: { ids: Array.from(selectedCustomerIds) },
              });
              if (showToast) showToast(res.data?.message || 'Customers processed.');
              setSelectedCustomerIds(new Set());
            } else if (customerToDelete) {
              const res = await api.delete(`/admin/customers/${customerToDelete.id}`);
              if (showToast) showToast(res.data?.message || 'Customer account removed.');
              if (selectedCustomer?.id === customerToDelete.id) setSelectedCustomer(null);
            }
            setDeleteModalOpen(false);
            setCustomerToDelete(null);
            fetchCustomers();
          } catch (err) {
            console.error('Delete customer error:', err);
            if (showToast) showToast(err.response?.data?.error || 'Failed to delete customer', 'error');
          } finally {
            setDeleteLoading(false);
          }
        }}
        title={isBulkDeleting ? `Delete ${selectedCustomerIds.size} Selected Customers` : `Delete Customer (${customerToDelete?.name || ''})`}
        message={
          isBulkDeleting
            ? `Are you sure you want to delete ${selectedCustomerIds.size} selected customer accounts? Accounts with past dining or order records will be safely archived to protect order ledgers.`
            : `Are you sure you want to remove customer "${customerToDelete?.name}"? If this customer has existing orders, they will be safely deactivated and archived.`
        }
        itemCount={isBulkDeleting ? selectedCustomerIds.size : 1}
        itemName={customerToDelete ? `${customerToDelete.name} (${customerToDelete.email})` : ''}
        isBulk={isBulkDeleting}
        confirmButtonText={isBulkDeleting ? 'Delete Selected' : 'Delete Customer'}
        loading={deleteLoading}
        warningNotes={[
          'Customers with zero orders are permanently deleted.',
          'Customers with past dining records are safely archived to protect sales ledger integrity.',
        ]}
      />
    </div>
  );
};

export default AdminCustomersView;



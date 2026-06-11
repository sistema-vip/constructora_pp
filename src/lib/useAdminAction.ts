'use client';

import { useUser } from './UserContext';

export function useAdminAction() {
  const { role, loading } = useUser();
  const isAdmin = role === 'admin';
  const isObserver = role === 'viewer';
  const isSales = role === 'sales';
  const isClient = role === 'client';

  const canCreate = isAdmin; // Only admin can create clients and accounts globally
  const canEdit = isAdmin;
  const canDelete = isAdmin;
  const canCreateProposal = isAdmin || isClient || isSales; // Client can create proposals

  const requireAdmin = (action: string) => {
    if (!isAdmin) {
      console.warn(`⚠️ Solo administradores pueden ${action}`);
      return false;
    }
    return true;
  };

  return {
    isAdmin,
    isObserver,
    isSales,
    isClient,
    canCreate,
    canEdit,
    canDelete,
    canCreateProposal,
    requireAdmin,
    loading,
  };
}

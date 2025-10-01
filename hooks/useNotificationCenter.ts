/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

// Hooks
import { useCDF } from './useCDF';
import { useToast } from '@/hooks/useToast';

export const useNotificationCenter = () => {

  const { store , fetchNodesAndGroups} = useCDF();
  const toast = useToast();

  // States
  const user = store?.userStore?.user;
  const [sharingList, setSharingList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSharingRequests();
  }, []);

  /**
   * Loads the sharing requests for the user.
   * 
   * This function fetches the sharing requests for the user from the server.
   * It also formats the timestamp for the sharing requests.
   */
  const loadSharingRequests = async () => {
    setIsLoading(true);
    try {
      const sharingRequests: any[] = [];
      const nodeSharingRequests = await user?.getReceivedNodeSharingRequests();
      // Node Sharing Requests
      if (nodeSharingRequests) {
        const request = Object.values(nodeSharingRequests.sharedRequests).reduce((acc: any, curr: any) => {
          curr.forEach((item: any) => {
            acc.push({ ...item, type: 'node' });
          });
          return acc;
        }, []);

        sharingRequests.push(...request);
      }

      const groupSharingRequests = await user?.getReceivedGroupSharingRequests();
      // Group Sharing Requests
      if (groupSharingRequests) {
        const request = Object.values(groupSharingRequests.sharedRequests).reduce((acc: any, curr: any) => {
          curr.forEach((item: any) => {
            acc.push({ ...item, type: 'group' });
          });
          return acc;
        }, []);

        sharingRequests.push(...request);
      }

      setSharingList(sharingRequests.sort((a: any, b: any) => b.timestamp - a.timestamp));
      setIsLoading(false);

    } catch (error) {
      setIsLoading(false);
      console.error('Error loading sharing requests:', error);
    }
  };

  /**
   * Formats the timestamp for the sharing requests.
   * 
   * This function formats the timestamp for the sharing requests.
   * It also formats the timestamp for the sharing requests.
   */
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  /**
   * Handles the acceptance or rejection of a sharing request.
   * 
   * This function handles the acceptance or rejection of a sharing request.
   * It also updates the sharing requests list.
   */
  const handleAccept = async (request: any, accept: boolean) => {
    setIsLoading(true);
    try {
      request.loading = true;
      if (accept) {
        request.acceptLoading = true;
        await request.accept();
      } else {
        request.declineLoading = true;
        await  request.decline();
      }
      setSharingList(prev =>
        prev.map(item =>
          item.id === request.id
            ? { ...item, status: accept ? 'accepted' : 'declined' }
            : item
        )
      );
      /*
      For notification center, we need to fetch the first page again
      */
      const shouldFetchFirstPage = true;
      fetchNodesAndGroups(shouldFetchFirstPage);

      if(request.type === 'group') {
        // make invited group as selected home when user accepts the invitation
        store.groupStore.currentHomeId = request.groupIds[0];
      }
      setIsLoading(false);
    } catch (error) {
      toast.showError('Failed to update request');
      console.error('Error updating request:', error);
    } finally {
      request.loading = false;
      request.acceptLoading = false;
      request.declineLoading = false;
      setIsLoading(false);
    }
  };

  return {
    sharingList,
    isLoading,
    formatTimestamp,
    handleAccept,
  };
}; 
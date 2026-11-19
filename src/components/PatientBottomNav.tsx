import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavigation from '@/components/BottomNavigation';
import ConfirmationModal from '@/components/sos/ConfirmationModal';
import { useIdentityVerification } from '@/contexts/IdentityVerificationContext';

/**
 * Mobile/tablet-only bottom navigation for patient routes that don't use MainLayout.
 * Hidden on desktop (lg+). Includes SOS confirmation modal.
 */
const PatientBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const [showSOSModal, setShowSOSModal] = useState(false);
  const { requireVerified } = useIdentityVerification();

  return (
    <>
      <div className="md:hidden">
        <BottomNavigation onSOSClick={() => { if (requireVerified('sos')) setShowSOSModal(true); }} />
      </div>
      <ConfirmationModal
        open={showSOSModal}
        onOpenChange={setShowSOSModal}
        onConfirm={() => {
          setShowSOSModal(false);
          navigate('/sos');
        }}
      />
    </>
  );
};

export default PatientBottomNav;

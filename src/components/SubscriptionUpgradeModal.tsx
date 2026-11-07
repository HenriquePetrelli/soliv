import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PLAN_LIST } from '@/lib/plans';

interface SubscriptionUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  description?: string;
}

const SubscriptionUpgradeModal: React.FC<SubscriptionUpgradeModalProps> = ({
  isOpen,
  onClose,
  feature,
  description = "Essa funcionalidade está disponível nos planos Essencial, Flex e Completo."
}) => {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onClose();
    navigate('/subscription-plans');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          
          <DialogTitle className="text-xl font-semibold">
            {feature}
          </DialogTitle>
          
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-3 gap-2">
            {PLAN_LIST.map((plan) => (
              <div
                key={plan.id}
                className={
                  plan.popular
                    ? 'text-center p-3 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border border-primary/20'
                    : 'text-center p-3 bg-muted/50 rounded-lg'
                }
              >
                <div className={plan.popular ? 'text-sm font-medium text-primary' : 'text-sm font-medium text-foreground'}>{plan.name}</div>
                <div className="text-xs text-muted-foreground">{plan.price}{plan.period}</div>
                <div className="mt-1 text-[11px] leading-tight text-muted-foreground">{plan.consultation}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col space-y-2">
            <Button onClick={handleUpgrade} className="w-full">
              <Sparkles className="w-4 h-4 mr-2" />
              Assinar Agora
            </Button>
            <Button variant="outline" onClick={onClose} className="w-full">
              Talvez Depois
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionUpgradeModal;
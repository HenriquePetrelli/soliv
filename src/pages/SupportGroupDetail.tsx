import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Info, Plus, User, ThumbsUp, ThumbsDown, Edit, Trash2, Filter, Crown, Flag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useGroupTestimonials, useGroupSymptoms, type GroupTestimonial, type TestimonialReportReason } from '@/hooks/useSupportGroups';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PatientBottomNav from '@/components/PatientBottomNav';
import PageHeader from '@/components/PageHeader';
import AddTestimonialForm from '@/components/support-groups/AddTestimonialForm';
import EditTestimonialForm from '@/components/support-groups/EditTestimonialForm';
import SubscriptionUpgradeModal from '@/components/SubscriptionUpgradeModal';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getJournalMood } from '@/components/journal/journalMoods';
import { cn } from '@/lib/utils';
import { hasPaidPlan } from '@/lib/plans';

interface TestimonialCardProps {
  testimonial: GroupTestimonial;
  symptomName?: string;
  onLike: (testimonialId: string, tipo: 'positivo' | 'negativo' | 'none') => void;
  isPremiumUser?: boolean;
  onEdit: (testimonial: GroupTestimonial) => void;
  onDelete: (testimonialId: string) => void;
  onReport: (testimonial: GroupTestimonial) => void;
  groupName: string;
}

const TestimonialCard = ({ testimonial, symptomName, onLike, onEdit, onDelete, onReport, groupName, isPremiumUser = false }: TestimonialCardProps) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const userName = testimonial.anonimo 
    ? 'Anônimo' 
    : testimonial.autor_nome || 'Usuário';

  const isOwnTestimonial = testimonial.is_mine;
  const userLikeType = testimonial.user_like?.tipo;

  return (
    <Card className=" transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              {testimonial.anonimo ? (
                <User className="w-5 h-5" />
              ) : (
                userName.charAt(0).toUpperCase()
              )}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-foreground">
                {userName}
              </h4>
              {testimonial.anonimo && (
                <Badge variant="secondary" className="text-xs">
                  Anônimo
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{formatDate(testimonial.criado_em)}</span>
              {(() => {
                const m = getJournalMood(testimonial.humor);
                const Icon = m.Icon;
                return (
                  <div className="flex items-center gap-1">
                    <Icon className={cn('w-4 h-4', m.colorClass)} />
                    <span>{m.label}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Denúncia discreta — só em depoimentos de outras pessoas */}
          {!isOwnTestimonial && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReport(testimonial)}
              disabled={testimonial.reported_by_me}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              aria-label={testimonial.reported_by_me ? 'Depoimento já denunciado' : 'Denunciar depoimento'}
              title={testimonial.reported_by_me ? 'Você já denunciou este depoimento' : 'Denunciar depoimento'}
            >
              <Flag className="w-4 h-4" />
            </Button>
          )}

          {/* Edit/Delete buttons for own testimonials */}
          {isOwnTestimonial && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(testimonial)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir depoimento</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir este depoimento? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(testimonial.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
        
        {symptomName && (
          <div className="pt-2">
            <Badge variant="outline" className="text-xs">
              {symptomName}
            </Badge>
          </div>
        )}

        {isOwnTestimonial && testimonial.under_review && (
          <p className="pt-2 text-xs text-muted-foreground" data-testid="under-review">
            Em análise: recebeu denúncias e só você vê este depoimento até a moderação revisar.
          </p>
        )}
      </CardHeader>
      
      <CardContent className="pt-0 space-y-4">
        <p className="text-foreground leading-relaxed whitespace-pre-wrap">
          {testimonial.texto}
        </p>
        
        {/* Like/Dislike section - always visible */}
        <div className="pt-2 border-t border-border/50 space-y-3">
          {/* Like counts display */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ThumbsUp className="w-4 h-4" />
              <span className="text-sm font-medium">{testimonial.likes_positivos} curtidas</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <ThumbsDown className="w-4 h-4" />
              <span className="text-sm font-medium">{testimonial.likes_negativos} não curtidas</span>
            </div>
          </div>

          {/* Interactive like buttons for non-owners */}
          {!isOwnTestimonial && (
            <div className="flex items-center gap-3">
              <Button
                variant={userLikeType === 'positivo' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onLike(testimonial.id, userLikeType === 'positivo' ? 'none' : 'positivo')}
                disabled={!isPremiumUser}
                className={`flex items-center gap-2 h-9 px-4 transition-all ${
                  userLikeType === 'positivo' 
                    ? 'bg-success hover:bg-success/90 text-white border-green-600' 
                    : 'text-muted-foreground hover:text-success hover:border-green-600'
                } ${!isPremiumUser ? 'opacity-60' : ''}`}
              >
                <ThumbsUp className="w-4 h-4" />
                <span>{userLikeType === 'positivo' ? 'Curtido' : 'Curtir'}</span>
                {!isPremiumUser && <Crown className="w-3 h-3 ml-1" />}
              </Button>
              
              <Button
                variant={userLikeType === 'negativo' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onLike(testimonial.id, userLikeType === 'negativo' ? 'none' : 'negativo')}
                disabled={!isPremiumUser}
                className={`flex items-center gap-2 h-9 px-4 transition-all ${
                  userLikeType === 'negativo' 
                    ? 'bg-destructive hover:bg-destructive/90 text-white border-red-600' 
                    : 'text-muted-foreground hover:text-destructive hover:border-red-600'
                } ${!isPremiumUser ? 'opacity-60' : ''}`}
              >
                <ThumbsDown className="w-4 h-4" />
                <span>{userLikeType === 'negativo' ? 'Não curtido' : 'Não curtir'}</span>
                {!isPremiumUser && <Crown className="w-3 h-3 ml-1" />}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const REPORT_REASONS: { value: TestimonialReportReason; label: string }[] = [
  { value: 'ofensivo', label: 'Ofensivo, discriminatório ou assédio' },
  { value: 'risco', label: 'Incentiva autolesão ou coloca alguém em risco' },
  { value: 'dados_pessoais', label: 'Expõe dados pessoais de alguém' },
  { value: 'spam', label: 'Propaganda ou spam' },
  { value: 'outro', label: 'Outro motivo' },
];

const SupportGroupDetail = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [showSymptoms, setShowSymptoms] = useState(false);
  const [showAddTestimonial, setShowAddTestimonial] = useState(false);
  const [showEditTestimonial, setShowEditTestimonial] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState<GroupTestimonial | null>(null);
  const [reportTarget, setReportTarget] = useState<GroupTestimonial | null>(null);
  const [reportReason, setReportReason] = useState<TestimonialReportReason>('ofensivo');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalFeature, setUpgradeModalFeature] = useState('');
  
  const { subscribed, subscriptionTier } = useSubscription();

  const [groupName, setGroupName] = useState<string>(location.state?.groupName || '');
  const { testimonials, loading: testimonialsLoading, likeTestimonial, updateTestimonial, deleteTestimonial, reportTestimonial, refetch } = useGroupTestimonials(groupId || '', filter === 'mine');
  const { symptoms, loading: symptomsLoading } = useGroupSymptoms(groupName);

  // location.state is empty on a page reload or direct link — fall back to
  // fetching the group's name from the database so the header/queries don't
  // silently fall back to the generic "Grupo de Apoio" placeholder.
  useEffect(() => {
    if (groupName || !groupId) return;

    const fetchGroupName = async () => {
      const { data, error } = await supabase
        .from('support_groups')
        .select('nome')
        .eq('id', groupId)
        .single();

      if (!error && data) {
        setGroupName(data.nome);
      }
    };

    fetchGroupName();
  }, [groupId, groupName]);

  if (!groupId) {
    navigate('/support-groups');
    return null;
  }

  const handleTestimonialAdded = () => {
    setShowAddTestimonial(false);
    refetch(filter === 'mine');
  };

  const handleEditTestimonial = (testimonial: GroupTestimonial) => {
    setEditingTestimonial(testimonial);
    setShowEditTestimonial(true);
  };

  const handleUpdateTestimonial = async (testimonialId: string, updates: Parameters<typeof updateTestimonial>[1]) => {
    const success = await updateTestimonial(testimonialId, updates);
    if (success) {
      setShowEditTestimonial(false);
      setEditingTestimonial(null);
    }
    return success;
  };

  const handleDeleteTestimonial = async (testimonialId: string) => {
    await deleteTestimonial(testimonialId);
  };

  const handleFilterChange = (newFilter: 'all' | 'mine') => {
    setFilter(newFilter);
    refetch(newFilter === 'mine');
  };

  const handleAddTestimonialClick = () => {
    if (!hasPaidPlan(subscribed, subscriptionTier)) {
      setUpgradeModalFeature('Criar Depoimento');
      setShowUpgradeModal(true);
      return;
    }
    setShowAddTestimonial(true);
  };

  const handleLikeClick = (testimonialId: string, tipo: 'positivo' | 'negativo' | 'none') => {
    if (!hasPaidPlan(subscribed, subscriptionTier)) {
      setUpgradeModalFeature('Avaliar Depoimentos');
      setShowUpgradeModal(true);
      return;
    }
    likeTestimonial(testimonialId, tipo);
  };

  const isPremiumUser = hasPaidPlan(subscribed, subscriptionTier);
  const displayGroupName = groupName || 'Grupo de Apoio';

  return (
    <div className="has-tabs">
      <div className="screen">
        <PageHeader
          title={displayGroupName}
          backTo="/support-groups"
          rightAction={
            <Button
              onClick={handleAddTestimonialClick}
              size="icon"
              variant="ghost"
              aria-label="Adicionar depoimento"
              className="rounded-full bg-white/15 text-white hover:bg-white/25 hover:text-white h-10 w-10"
            >
              <Plus className="w-5 h-5" />
            </Button>
          }
        />
        <main className="container mx-auto px-4 py-6">
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <Dialog open={showSymptoms} onOpenChange={setShowSymptoms}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Info className="w-4 h-4 mr-2" />
                    Ver sintomas
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                  <DialogHeader className="pt-3">
                    <DialogTitle className="text-base sm:text-lg leading-snug">
                      Sintomas relacionados
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">{displayGroupName}</p>
                  </DialogHeader>
                  <div className="space-y-2">
                    {symptomsLoading ? (
                      <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full rounded-md" />
                        ))}
                      </div>
                    ) : symptoms.length > 0 ? (
                      <ul className="space-y-2">
                        {symptoms.map((symptom, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-3 text-sm p-3 rounded-lg bg-muted/50 border border-border/50"
                          >
                            <span className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                            <span className="leading-relaxed">{symptom}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Nenhum sintoma específico cadastrado para este grupo.
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Filter */}
            <Select value={filter} onValueChange={(value: 'all' | 'mine') => handleFilterChange(value)}>
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os depoimentos</SelectItem>
                <SelectItem value="mine">Meus depoimentos</SelectItem>
              </SelectContent>
            </Select>

            {/* Add Testimonial Dialog (triggered from header button) */}
            <Dialog open={showAddTestimonial} onOpenChange={setShowAddTestimonial}>
              <DialogContent className="p-0 gap-0 max-w-full w-screen h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl rounded-none flex flex-col">
                <DialogHeader className="sticky top-0 z-10 bg-background border-b px-6 py-4 text-left">
                  <DialogTitle>Adicionar Depoimento</DialogTitle>
                  <DialogDescription>
                    Compartilhe sua experiência com o grupo.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 py-4 pb-32 sm:pb-12">
                  <AddTestimonialForm
                    groupId={groupId}
                    groupName={groupName}
                    onSuccess={handleTestimonialAdded}
                    onCancel={() => setShowAddTestimonial(false)}
                  />
                </div>
              </DialogContent>
            </Dialog>

            {/* Edit Testimonial Dialog */}
            <Dialog open={showEditTestimonial} onOpenChange={setShowEditTestimonial}>
              <DialogContent className="p-0 gap-0 max-w-full w-screen h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl rounded-none flex flex-col">
                <DialogHeader className="sticky top-0 z-10 bg-background border-b px-6 py-4 text-left">
                  <DialogTitle>Editar Depoimento</DialogTitle>
                  <DialogDescription>
                    Atualize as informações do seu depoimento.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 py-4 pb-32 sm:pb-12">
                  {editingTestimonial && (
                    <EditTestimonialForm
                      groupName={groupName}
                      testimonial={editingTestimonial}
                      onSave={handleUpdateTestimonial}
                      onCancel={() => {
                        setShowEditTestimonial(false);
                        setEditingTestimonial(null);
                      }}
                    />
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Testimonials */}
            <div className="space-y-4">
              {testimonialsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="w-10 h-10 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : testimonials.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <User className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      {filter === 'mine' ? 'Você ainda não tem depoimentos' : 'Ainda não há depoimentos'}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {filter === 'mine' 
                        ? 'Compartilhe sua primeira experiência neste grupo.' 
                        : 'Seja o primeiro a compartilhar sua experiência neste grupo.'
                      }
                    </p>
                    <Button 
                      onClick={handleAddTestimonialClick}
                      className="bg-primary hover:bg-primary/90"
                      disabled={!isPremiumUser}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {filter === 'mine' ? 'Adicionar Meu Primeiro Depoimento' : 'Adicionar Primeiro Depoimento'}
                      {!isPremiumUser && <Crown className="w-4 h-4 ml-2" />}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                testimonials.map((testimonial) => (
                  <TestimonialCard
                    key={testimonial.id}
                    testimonial={testimonial}
                    symptomName={testimonial.sintoma_texto || undefined}
                    onLike={handleLikeClick}
                    onEdit={handleEditTestimonial}
                    onDelete={handleDeleteTestimonial}
                    onReport={setReportTarget}
                    groupName={groupName}
                    isPremiumUser={isPremiumUser}
                  />
                ))
              )}
            </div>

            {/* Denúncia de depoimento */}
            <Dialog
              open={!!reportTarget}
              onOpenChange={(open) => {
                if (!open) {
                  setReportTarget(null);
                  setReportDetails('');
                  setReportReason('ofensivo');
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Denunciar depoimento</DialogTitle>
                  <DialogDescription>
                    A denúncia é anônima para o autor. Nossa equipe revisa e decide o que fazer — nada é removido automaticamente.
                  </DialogDescription>
                </DialogHeader>
                <RadioGroup
                  value={reportReason}
                  onValueChange={(v) => setReportReason(v as TestimonialReportReason)}
                  className="space-y-1"
                >
                  {REPORT_REASONS.map((r) => (
                    <div key={r.value} className="flex items-center gap-3 min-h-12">
                      <RadioGroupItem value={r.value} id={`report-${r.value}`} />
                      <Label htmlFor={`report-${r.value}`} className="font-normal leading-snug">{r.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
                <Textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value.slice(0, 500))}
                  placeholder="Quer contar mais? (opcional)"
                  aria-label="Detalhes da denúncia (opcional)"
                  rows={3}
                />
                {reportReason === 'risco' && (
                  <p className="text-sm text-muted-foreground">
                    Se alguém corre perigo agora, ligue para o CVV (188) ou o SAMU (192).
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setReportTarget(null)} disabled={reportSending}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={reportSending}
                    onClick={async () => {
                      if (!reportTarget) return;
                      setReportSending(true);
                      const ok = await reportTestimonial(reportTarget.id, reportReason, reportDetails);
                      setReportSending(false);
                      if (ok) {
                        setReportTarget(null);
                        setReportDetails('');
                        setReportReason('ofensivo');
                      }
                    }}
                  >
                    {reportSending ? 'Enviando...' : 'Enviar denúncia'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Subscription Upgrade Modal */}
            <SubscriptionUpgradeModal
              isOpen={showUpgradeModal}
              onClose={() => setShowUpgradeModal(false)}
              feature={upgradeModalFeature}
            />
          </div>
        </main>
      </div>
      <PatientBottomNav />
    </div>
  );
};

export default SupportGroupDetail;
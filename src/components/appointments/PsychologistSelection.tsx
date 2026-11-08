import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PsychologistFilters } from './PsychologistFilters';
import { PsychologistList, PsychologistData } from './PsychologistList';
import { PsychologistModal } from './PsychologistModal';

interface PsychologistSelectionProps {
  onSelect: (psychologist: PsychologistData) => void;
}

export const PsychologistSelection: React.FC<PsychologistSelectionProps> = ({
  onSelect
}) => {
  const [psychologists, setPsychologists] = useState<PsychologistData[]>([]);
  const [filteredPsychologists, setFilteredPsychologists] = useState<PsychologistData[]>([]);
  const [selectedPsychologist, setSelectedPsychologist] = useState<PsychologistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [patientLocation, setPatientLocation] = useState<{ city: string; state: string } | null>(null);
  
  // Filters
  const [specialty, setSpecialty] = useState('all');
  const [specialties, setSpecialties] = useState<string[]>([]);
  
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchPatientLocation = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('city, state')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error('Error fetching patient location:', error);
        return;
      }
      
      setPatientLocation({ city: data.city, state: data.state });
    } catch (error) {
      console.error('Error fetching patient location:', error);
    }
  };

  const fetchPsychologists = async () => {
    try {
      setLoading(true);
      
      // Buscar diretamente da tabela psychologists com approved = true
      const { data, error } = await supabase
        .from('psychologists')
        .select('id, user_id, full_name, specialization, bio, crp_number, city, state, address, approved, total_appointments, average_rating, ratings_count')
        .eq('approved', true)
        .order('full_name', { ascending: true });
  
      if (error) throw error;
  
      // Mapear para o formato PsychologistData
      const formattedData: PsychologistData[] = data?.map(psych => ({
        id: psych.id,
        user_id: psych.user_id,
        full_name: psych.full_name,
        specialty: psych.specialization, // Usar specialization como specialty
        specialization: psych.specialization,
        bio: psych.bio,
        crp_number: psych.crp_number,
        city: psych.city,
        address: psych.address,
        approved: psych.approved,
        // Adicionar outros campos necessários
        state: psych.state,
        total_appointments: psych.total_appointments || 0,
        average_rating: psych.average_rating ?? null,
        // ratings_count do cadastro nunca é atualizado: a contagem vem da função.
        ratings_count: undefined,
      })) || [];
  
      // Consultas e SOS concluídos de cada um. Sem a função no banco (antes da
      // migração), a lista segue com o total de consultas do cadastro.
      const { data: stats } = await supabase.rpc('get_psychologists_public_stats', {
        p_user_ids: formattedData.map((p) => p.user_id),
      });
      const statsByUser = new Map((stats ?? []).map((row) => [row.user_id, row]));
      const withStats = formattedData.map((p) => {
        const row = statsByUser.get(p.user_id);
        if (!row) return p;
        const withCounts = { ...p, consultation_count: row.consultation_count, sos_count: row.sos_count };
        // Nota real das avaliações (função atualizada); sem ela, fica a média do cadastro.
        return row.ratings_count === undefined
          ? withCounts
          : { ...withCounts, average_rating: row.average_rating, ratings_count: row.ratings_count };
      });

      setPsychologists(withStats);
      
      // Extrair especialidades únicas para filtro
      const uniqueSpecialties = Array.from(
        new Set(
          formattedData
            .map(p => p.specialization)
            .filter(Boolean)
        )
      );
      setSpecialties(uniqueSpecialties);
      
    } catch (error: unknown) {
      console.error('Error fetching psychologists:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar psicólogos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  useEffect(() => {
    let filtered = [...psychologists];

    if (specialty && specialty !== 'all') {
      filtered = filtered.filter(p => 
        p.specialty === specialty || p.specialization === specialty
      );
    }


    setFilteredPsychologists(filtered);
  }, [psychologists, specialty, patientLocation]);

  useEffect(() => {
    fetchPsychologists();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [user?.id]);

  const handlePsychologistSelect = (psychologist: PsychologistData) => {
    setSelectedPsychologist(psychologist);
  };

  const handleSchedule = () => {
    if (selectedPsychologist) {
      onSelect(selectedPsychologist);
      setSelectedPsychologist(null);
    }
  };

  const handleCloseModal = () => {
    setSelectedPsychologist(null);
  };

  return (
    <div className="space-y-6">
      <PsychologistFilters
        specialty={specialty}
        setSpecialty={setSpecialty}
        specialties={specialties}
      />

      <PsychologistList
        psychologists={filteredPsychologists}
        onSelect={handlePsychologistSelect}
        loading={loading}
      />

      <PsychologistModal
        psychologist={selectedPsychologist}
        onClose={handleCloseModal}
        onSchedule={handleSchedule}
      />
    </div>
  );
};
import { useState, useEffect, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { findCity, findStateAbbreviation } from '@/lib/placeMatch';
import AddressAutofillInputs from '@/components/AddressAutofillInputs';
import type { UseFormReturn } from 'react-hook-form';

/** Campos que este bloco preenche no formulário de quem o usa. */
type LocationValues = { state?: string; city?: string };

interface State {
  abbreviation: string;
  name: string;
}

interface City {
  name: string;
}

interface LocationFieldsProps<T extends LocationValues> {
  form: UseFormReturn<T>;
}

export const LocationFields = <T extends LocationValues>({ form: parentForm }: LocationFieldsProps<T>) => {
  // Só mexe em `state` e `city`, que todo formulário que usa o bloco tem.
  const form = parentForm as unknown as UseFormReturn<LocationValues>;
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const selectedState = form.watch('state');
  // Preenchimento automático do navegador: guardado até as listas chegarem.
  const pendingState = useRef<string | null>(null);
  const pendingCity = useRef<string | null>(null);

  // Fetch Brazilian states on component mount
  useEffect(() => {
    const fetchStates = async () => {
      try {
        const { data, error } = await supabase
          .from('brazilian_states')
          .select('abbreviation, name')
          .order('name');
        
        if (error) throw error;
        setStates(data || []);
        const autofilled = findStateAbbreviation(data || [], pendingState.current);
        if (autofilled && !form.getValues('state')) {
          pendingState.current = null;
          form.setValue('state', autofilled, { shouldValidate: true });
        }
      } catch (error) {
        console.error('Error fetching states:', error);
        toast.error('Erro ao carregar estados');
      }
    };

    fetchStates();
  }, [form]);

  // Fetch cities when state changes
  useEffect(() => {
    let cancelled = false;
    const fetchCities = async () => {
      if (!selectedState) {
        setCities([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('brazilian_cities')
          .select('name')
          .eq('state', selectedState)
          .order('name');
        
        if (error) throw error;
        if (cancelled) return; // o estado mudou enquanto a lista baixava
        const list = data || [];
        setCities(list);
        // Mantém a cidade se ela existe no estado; senão usa a do
        // preenchimento automático; senão limpa (antes limpava sempre, e a
        // cidade do preenchimento automático se perdia).
        const kept = findCity(list, form.getValues('city'));
        const autofilled = kept ? null : findCity(list, pendingCity.current);
        if (autofilled) pendingCity.current = null;
        const city = kept ?? autofilled ?? '';
        if (city !== form.getValues('city')) form.setValue('city', city, { shouldValidate: Boolean(city) });
      } catch (error) {
        console.error('Error fetching cities:', error);
        toast.error('Erro ao carregar cidades');
      }
    };

    if (selectedState) {
      fetchCities();
    }
    return () => {
      cancelled = true;
    };
  }, [selectedState, form]);

  const handleAutofillState = (value: string) => {
    const abbreviation = findStateAbbreviation(states, value);
    if (abbreviation) form.setValue('state', abbreviation, { shouldValidate: true });
    else pendingState.current = value;
  };
  const handleAutofillCity = (value: string) => {
    const city = findCity(cities, value);
    if (city) form.setValue('city', city, { shouldValidate: true });
    else pendingCity.current = value;
  };

  return (
    <>
      <AddressAutofillInputs onState={handleAutofillState} onCity={handleAutofillCity} />
      <FormField
        control={form.control}
        name="state"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Estado *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione seu estado" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {states.map((state) => (
                  <SelectItem key={state.abbreviation} value={state.abbreviation}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="city"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cidade *</FormLabel>
            <Select 
              onValueChange={field.onChange}
              value={field.value}
              disabled={!selectedState}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={selectedState ? "Selecione sua cidade" : "Primeiro selecione o estado"} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {cities.map((city, index) => (
                  <SelectItem key={index} value={city.name}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};
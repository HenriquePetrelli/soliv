import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import MultiSelectModal from "./ui/multi-select-modal";
import { SINTOMAS, SINTOMA_GRUPOS } from "@/data/sintomas";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { validateCPF } from "@/utils/cpf";
import LegalConsents from "@/components/legal/LegalConsents";
import { EMPTY_CONSENTS, allConsentsGiven, consentKeysFor } from "@/components/legal/consents";
import { signupAcceptanceMetadata } from "@/lib/legal";
import { joinErrorMessage, normalizeInviteCode, type JoinErrorCode } from "@/lib/organizations";
import { passwordProblem, PASSWORD_HINT } from '@/lib/password';
import { findCity, findStateAbbreviation } from '@/lib/placeMatch';
import AddressAutofillInputs from '@/components/AddressAutofillInputs';

interface SignUpFormProps {
  userType: "patient" | "psychologist";
}

interface State {
  abbreviation: string;
  name: string;
}

interface City {
  name: string;
}

const SignUpForm = ({ userType }: SignUpFormProps) => {
const [formData, setFormData] = useState({
  name: "",
  email: "",
  cpf: "",
  state: "",
  city: "",
  phone: "",
  sintomas: [] as string[],
  password: "",
  confirmPassword: "",
  // Psychologist fields
  crp: "",
  specialty: "",
});

  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: boolean }>({});
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const [isSintomasModalOpen, setIsSintomasModalOpen] = useState(false);
  const [consents, setConsents] = useState(EMPTY_CONSENTS);
  const [showConsentErrors, setShowConsentErrors] = useState(false);
  // B2B: código da empresa (opcional). O banco aplica no momento do cadastro.
  const [showCompanyCode, setShowCompanyCode] = useState(false);
  const [companyCode, setCompanyCode] = useState("");
  const [companyCheck, setCompanyCheck] = useState<{ valid: boolean; message: string } | null>(null);

  const checkCompanyCode = async (): Promise<boolean> => {
    const code = normalizeInviteCode(companyCode);
    if (!code) {
      setCompanyCheck(null);
      return true;
    }
    const { data, error } = await supabase.rpc('check_organization_code', { p_code: code });
    const result = data as unknown as { valid: boolean; error?: JoinErrorCode; organization?: string; tier?: string; domain?: string | null } | null;
    if (error || !result) {
      setCompanyCheck({ valid: false, message: 'Não foi possível conferir o código agora.' });
      return false;
    }
    if (!result.valid) {
      setCompanyCheck({ valid: false, message: joinErrorMessage({ error: result.error }) });
      return false;
    }
    if (result.domain && !formData.email.toLowerCase().endsWith(`@${result.domain}`)) {
      setCompanyCheck({ valid: false, message: joinErrorMessage({ error: 'domain_mismatch', domain: result.domain }) });
      return false;
    }
    setCompanyCheck({ valid: true, message: `Plano ${result.tier} pela ${result.organization}` });
    return true;
  };
  const navigate = useNavigate();

  const isPatient = userType === "patient";
  const title = isPatient ? "Cadastro do Paciente" : "Cadastro do Psicólogo";

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
        // Estado vindo do preenchimento automático antes da lista chegar.
        const autofilled = findStateAbbreviation(data || [], pendingState.current);
        if (autofilled) {
          pendingState.current = null;
          setFormData(prev => (prev.state ? prev : { ...prev, state: autofilled }));
        }
      } catch (error) {
        console.error('Error fetching states:', error);
        toast.error('Erro ao carregar estados');
      }
    };

    if (isPatient) {
      fetchStates();
    }
  }, [isPatient]);

  // Fetch cities when state changes
  useEffect(() => {
    let cancelled = false;
    const fetchCities = async () => {
      if (!formData.state) {
        setCities([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('brazilian_cities')
          .select('name')
          .eq('state', formData.state)
          .order('name');
        
        if (error) throw error;
        if (cancelled) return; // o estado mudou enquanto a lista baixava
        const list = data || [];
        setCities(list);
        // Mantém a cidade se ela existe no estado; senão usa a do
        // preenchimento automático (que chega antes da lista); senão limpa.
        const autofilled = findCity(list, pendingCity.current);
        pendingCity.current = null;
        setFormData(prev => {
          const city = findCity(list, prev.city) ?? autofilled ?? '';
          return city === prev.city ? prev : { ...prev, city };
        });
      } catch (error) {
        console.error('Error fetching cities:', error);
        toast.error('Erro ao carregar cidades');
      }
    };

    if (isPatient && formData.state) {
      fetchCities();
    }
    return () => {
      cancelled = true;
    };
  }, [formData.state, isPatient]);

  // Preenchimento automático do navegador (endereço salvo).
  const pendingState = useRef<string | null>(null);
  const pendingCity = useRef<string | null>(null);
  const handleAutofillState = (value: string) => {
    const abbreviation = findStateAbbreviation(states, value);
    if (abbreviation) handleInputChange('state', abbreviation);
    else pendingState.current = value;
  };
  const handleAutofillCity = (value: string) => {
    const city = findCity(cities, value);
    if (city) handleInputChange('city', city);
    else pendingCity.current = value;
  };

  // Função para aplicar máscara no CPF
  const formatCPF = (value: string) => {
    const cpf = value.replace(/\D/g, '');
    return cpf
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  // Função para aplicar máscara no telefone
  const formatPhone = (value: string) => {
    const phone = value.replace(/\D/g, '');
    return phone
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

  const handleInputChange = (field: string, value: string | string[]) => {
    // Aplicar máscaras para strings
    if (typeof value === 'string') {
      if (field === 'cpf') {
        value = formatCPF(value);
      } else if (field === 'phone') {
        value = formatPhone(value);
      }
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
    // Trocar o estado não apaga a cidade na hora: quando a lista do novo
    // estado chega, a cidade some só se não existir nele (ver fetchCities).
    
    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setShowErrorAlert(false);
    
    try {
      const newErrors: { [key: string]: boolean } = {};
      
      // Validar campos obrigatórios
      if (!formData.name) newErrors.name = true;
      if (!formData.email) newErrors.email = true;
      if (!formData.password) newErrors.password = true;
      if (!formData.confirmPassword) newErrors.confirmPassword = true;
      
      if (isPatient) {
        if (!formData.cpf) newErrors.cpf = true;
        if (!formData.state) newErrors.state = true;
        if (!formData.city) newErrors.city = true;
        if (!formData.phone) newErrors.phone = true;
        if (!formData.sintomas || formData.sintomas.length === 0) newErrors.sintomas = true;
        
        // Validar CPF se preenchido
        if (formData.cpf && !validateCPF(formData.cpf)) {
          newErrors.cpf = true;
          toast.error("CPF inválido");
          setErrors(newErrors);
          setShowErrorAlert(true);
          return;
        }
      } else {
        if (!formData.cpf) newErrors.cpf = true;
        if (!formData.crp) newErrors.crp = true;
        if (!formData.specialty) newErrors.specialty = true;
      }

      // Se há erros, mostrar alert e marcar campos
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        setShowErrorAlert(true);
        return;
      }

      if (isPatient && companyCode.trim() && !(await checkCompanyCode())) {
        toast.error("Confira o código da empresa ou apague o campo para continuar.");
        return;
      }

      if (!allConsentsGiven(consents, consentKeysFor(userType))) {
        setShowConsentErrors(true);
        toast.error("Marque as confirmações de idade e de aceite para criar a conta.");
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        toast.error("As senhas não coincidem");
        setErrors({ password: true, confirmPassword: true });
        return;
      }

      const weakPassword = passwordProblem(formData.password);
      if (weakPassword) {
        toast.error(weakPassword);
        setErrors({ password: true });
        return;
      }

      // Registro com Supabase Auth
      const redirectUrl = `${window.location.origin}/`;
      
      // Os dados do paciente vão junto com o cadastro e o banco cria tudo numa
      // operação só (antes era uma segunda chamada depois do login, que falhava
      // com a confirmação de e-mail ligada e deixava a conta pela metade).
      // O banco tira CPF, telefone e endereço dos dados do login depois de copiar.
      const { data, error } = await supabase.auth.signUp({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            user_type: userType,
            full_name: formData.name,
            ...signupAcceptanceMetadata(userType),
            ...(isPatient && normalizeInviteCode(companyCode) ? { organization_code: normalizeInviteCode(companyCode) } : {}),
            ...(isPatient
              ? {
                  cpf: formData.cpf.replace(/\D/g, ''),
                  state: formData.state,
                  city: formData.city,
                  phone: formData.phone.replace(/\D/g, ''),
                  sintomas: formData.sintomas,
                }
              : {}),
          }
        }
      });

      if (error) {
        if (/database error saving new user/i.test(error.message)) {
          toast.error("Não foi possível criar a conta. Se este CPF já tem cadastro, entre com o e-mail dele ou recupere a senha.");
        } else if (error.message.includes("User already registered")) {
          toast.error("Este email já está cadastrado. Tente fazer login.");
        } else if (error.message.includes("Password should be at least")) {
          toast.error(PASSWORD_HINT);
        } else if (error.message.includes("Unable to validate email address")) {
          toast.error("Email inválido. Verifique o endereço informado.");
        } else {
          toast.error("Erro ao criar conta. Tente novamente.");
        }
        console.error("SignUp error:", error);
        return;
      }

      if (!data.user) {
        toast.error("Erro ao criar conta. Tente novamente.");
        return;
      }

      // O perfil e os dados do paciente são criados pelo banco junto com a
      // conta (gatilho handle_new_user).
      if (!isPatient) {
        // For psychologists, create a registration record
        try {
          const { error: registrationError } = await supabase
            .from('psychologist_registrations')
            .insert({
              user_id: data.user.id,
              status: 'pending',
            });

          if (registrationError) {
            console.error('Error creating psychologist registration:', registrationError);
          }

// Create profile for psychologist
const { error: profileError } = await supabase
  .from('profiles')
  .insert({
    user_id: data.user.id,
    user_type: 'psychologist',
    full_name: formData.name,
    cpf: formData.cpf.replace(/\D/g, ''),
    crp: formData.crp,
    specialty: formData.specialty,
  });

          if (profileError) {
            console.error('Error creating psychologist profile:', profileError);
          }
        } catch (regError) {
          console.error('Error creating psychologist registration:', regError);
        }
      }

      if (isPatient && !data.session) {
        // Confirmação de e-mail ligada: a conta está criada, falta confirmar.
        toast.success("Conta criada! Enviamos um link para o seu e-mail: confirme e depois entre com sua senha.", { duration: 8000 });
      } else if (isPatient) {
        toast.success(`Bem-vindo, ${formData.name}!`);
      } else {
        toast.success(`Cadastro enviado para análise, Dr.(a) ${formData.name}. Você receberá um email quando for aprovado.`);
      }

      // Com a conta já logada, vai direto para o app (antes esperava 2 s e
      // voltava para a tela de login). Sem sessão (confirmação de e-mail
      // ligada), volta para a tela de entrada.
      navigate(isPatient && data.session ? "/home" : "/", { replace: true });

    } catch (error) {
      toast.error("Erro ao criar conta. Tente novamente.");
      console.error("SignUp error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm mx-auto shadow-calm border-0 animate-slide-up">
      <CardContent className="p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              {title}
            </h2>
            <p className="text-muted-foreground text-sm">
              Crie sua conta e comece sua jornada de bem-estar
            </p>
          </div>

          {showErrorAlert && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Preencha todos os campos obrigatórios corretamente.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground font-medium">
                Nome completo
              </Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Digite seu nome completo"
                required
                className={`h-12 rounded-xl border-border focus:ring-primary ${errors.name ? 'border-destructive' : ''}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">
                {isPatient ? "Email" : "Email principal"}
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder={isPatient ? "seu@email.com" : "profissional@email.com"}
                required
                className={`h-12 rounded-xl border-border focus:ring-primary ${errors.email ? 'border-destructive' : ''}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf" className="text-foreground font-medium">
                CPF
              </Label>
              <Input
                id="cpf"
                type="text"
                value={formData.cpf}
                onChange={(e) => handleInputChange("cpf", e.target.value)}
                placeholder="000.000.000-00"
                required
                className={`h-12 rounded-xl border-border focus:ring-primary ${errors.cpf ? 'border-destructive' : ''}`}
              />
            </div>

            {isPatient && (
              <>
                <AddressAutofillInputs onState={handleAutofillState} onCity={handleAutofillCity} />
                <div className="space-y-2">
                  <Label htmlFor="state" className="text-foreground font-medium">
                    Estado
                  </Label>
                  <Select value={formData.state} onValueChange={(value) => handleInputChange("state", value)}>
                    <SelectTrigger className={`h-12 rounded-xl border-border focus:ring-primary ${errors.state ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Selecione seu estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((state) => (
                        <SelectItem key={state.abbreviation} value={state.abbreviation}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city" className="text-foreground font-medium">
                    Cidade
                  </Label>
                  <Select 
                    value={formData.city} 
                    onValueChange={(value) => handleInputChange("city", value)}
                    disabled={!formData.state}
                  >
                    <SelectTrigger className={`h-12 rounded-xl border-border focus:ring-primary ${errors.city ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder={formData.state ? "Selecione sua cidade" : "Primeiro selecione o estado"} />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((city, index) => (
                        <SelectItem key={index} value={city.name}>
                          {city.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-foreground font-medium">
                    Telefone
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    placeholder="(11) 99999-9999"
                    required
                    className={`h-12 rounded-xl border-border focus:ring-primary ${errors.phone ? 'border-destructive' : ''}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sintomas" className="text-foreground font-medium">
                    O que você tem sentido?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Escolha um ou mais. Isso ajuda o psicólogo a te atender melhor, e você pode mudar depois no Perfil.
                  </p>
                  <MultiSelectModal
                    id="sintomas"
                    options={[...SINTOMAS]}
                    groups={SINTOMA_GRUPOS}
                    selectedValues={formData.sintomas}
                    onSelectionChange={(sintomas) => handleInputChange("sintomas", sintomas)}
                    placeholder="Escolher sintomas"
                    title="O que você tem sentido?"
                    description="Marque tudo o que tem acontecido com você nas últimas semanas."
                    noun={["sintoma", "sintomas"]}
                    invalid={Boolean(errors.sintomas)}
                    isOpen={isSintomasModalOpen}
                    onOpenChange={setIsSintomasModalOpen}
                  />
                  {errors.sintomas && (
                    <p className="text-sm text-destructive">
                      Selecione pelo menos um sintoma
                    </p>
                  )}
                </div>
              </>
            )}

            {!isPatient && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="crp" className="text-foreground font-medium">
                    Número do CRP
                  </Label>
                  <Input
                    id="crp"
                    type="text"
                    value={formData.crp}
                    onChange={(e) => handleInputChange("crp", e.target.value)}
                    placeholder="Ex: CRP 01/12345"
                    required
                    className={`h-12 rounded-xl border-border focus:ring-primary ${errors.crp ? 'border-destructive' : ''}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="specialty" className="text-foreground font-medium">
                    Especialidade(s)
                  </Label>
                  <Input
                    id="specialty"
                    type="text"
                    value={formData.specialty}
                    onChange={(e) => handleInputChange("specialty", e.target.value)}
                    placeholder="Ex: Psicologia Clínica, Neuropsicologia"
                    required
                    className={`h-12 rounded-xl border-border focus:ring-primary ${errors.specialty ? 'border-destructive' : ''}`}
                  />
                </div>

              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  placeholder={PASSWORD_HINT}
                  required
                  className={`h-12 rounded-xl border-border focus:ring-primary pr-12 ${errors.password ? 'border-destructive' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground font-medium">
                Confirmar senha
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                  placeholder="Digite sua senha novamente"
                  required
                  className={`h-12 rounded-xl border-border focus:ring-primary pr-12 ${errors.confirmPassword ? 'border-destructive' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          {isPatient && (
            <div className="space-y-2">
              {!showCompanyCode ? (
                <button
                  type="button"
                  onClick={() => setShowCompanyCode(true)}
                  className="text-sm font-medium text-primary underline underline-offset-2"
                >
                  Tenho um código da empresa
                </button>
              ) : (
                <>
                  <Label htmlFor="company-code" className="text-foreground font-medium">
                    Código da empresa (opcional)
                  </Label>
                  <Input
                    id="company-code"
                    value={companyCode}
                    onChange={(e) => {
                      setCompanyCode(e.target.value.toUpperCase());
                      setCompanyCheck(null);
                    }}
                    onBlur={() => void checkCompanyCode()}
                    autoComplete="off"
                    maxLength={20}
                    placeholder="Código enviado pelo RH"
                    className="h-12 rounded-xl border-border font-mono tracking-widest"
                  />
                  {companyCheck && (
                    <p role={companyCheck.valid ? undefined : 'alert'} className={`text-sm ${companyCheck.valid ? 'text-success' : 'text-destructive'}`}>
                      {companyCheck.message}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <LegalConsents
            userType={userType}
            value={consents}
            onChange={setConsents}
            showErrors={showConsentErrors}
          />

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-calm-sm transition-all duration-300 hover:shadow-calm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Criando conta..." : "Criar conta"}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Já tem uma conta? Faça login
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default SignUpForm;
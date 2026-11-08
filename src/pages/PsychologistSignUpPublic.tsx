import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InputMask from 'react-input-mask';
import type { InputHTMLAttributes } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import BackButton from "@/components/BackButton";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocationFields } from "@/components/psychologist/LocationFields";
import { PsychologistService } from "@/services/psychologist.service";
import { TRANSTORNOS } from "@/data/transtornos";
import MultiSelectModal from "@/components/ui/multi-select-modal";
import { validateCPF } from "@/utils/cpf";
import LegalConsents from "@/components/legal/LegalConsents";
import { EMPTY_CONSENTS, allConsentsGiven, consentKeysFor } from "@/components/legal/consents";
import { passwordProblem, PASSWORD_HINT } from '@/lib/password';

const specializations = [
  // Áreas tradicionais
  'Psicologia Clínica',
  'Psicologia Escolar/Educacional',
  'Psicologia Organizacional e do Trabalho',
  'Psicologia Social',
  'Psicologia Hospitalar',
  'Psicologia Jurídica/Forense',
  'Psicologia do Esporte',
  'Psicologia Comunitária',
  'Psicologia da Saúde',
  'Neuropsicologia',

  // Abordagens psicoterapêuticas
  'Psicanálise',
  'Terapia Cognitivo-Comportamental (TCC)',
  'Gestalt-terapia',
  'Psicoterapia Humanista/Existencial',
  'Análise do Comportamento',
  'Psicoterapia Sistêmica/Familiar',
  'Psicodrama',
  'Mindfulness e Terapias de Terceira Geração',

  // Áreas específicas de aplicação
  'Psicologia Infantil',
  'Psicologia do Adolescente',
  'Psicologia do Envelhecimento (Gerontopsicologia)',
  'Psicotraumatologia',
  'Psicologia da Emergência e Desastres',
  'Psicologia da Reabilitação',
  'Psicologia da Dependência Química',

  // Categoria aberta
  'Outras'
];

const formSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().refine((v) => passwordProblem(v) === null, { message: PASSWORD_HINT }),
  confirmPassword: z.string(),
  fullName: z.string().min(2, "Nome completo é obrigatório"),
  cpf: z.string().min(1, "CPF é obrigatório"),
  crp: z.string().min(5, "CRP é obrigatório"),
  
  specialty: z.string().min(1, "Especialidade é obrigatória"),
  areaAtendimento: z.array(z.string()).min(1, "Selecione pelo menos uma área de atendimento"),
  bio: z.string().min(50, "A biografia deve ter pelo menos 50 caracteres"),
  state: z.string().min(1, "Estado é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  
  address: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
}).refine((data) => validateCPF(data.cpf), {
  message: "CPF inválido. Verifique os números digitados.",
  path: ["cpf"],
})

type FormData = z.infer<typeof formSchema>;

const PsychologistSignUpPublic = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  // Confirmação de e-mail ligada: falta confirmar e entrar para enviar o documento.
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  // Erro do arquivo (inválido ou envio recusado): o campo fica vermelho.
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isAreasModalOpen, setIsAreasModalOpen] = useState(false);
  const [consents, setConsents] = useState(EMPTY_CONSENTS);
  const [showConsentErrors, setShowConsentErrors] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      cpf: "",
      crp: "",
      specialty: "",
      areaAtendimento: [],
      bio: "",
      state: "",
      city: "",
      
      address: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!allConsentsGiven(consents, consentKeysFor("psychologist"))) {
      setShowConsentErrors(true);
      toast.error("Marque as confirmações de idade e de aceite para se cadastrar.");
      return;
    }

    if (!documentFile) {
      toast.error("Envie um documento comprovante.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await PsychologistService.signUpPsychologist(
        {
          email: data.email,
          password: data.password,
          fullName: data.fullName,
          cpf: data.cpf.replace(/\D/g, ''),
          crp: data.crp,
          specialty: data.specialty,
          areaAtendimento: data.areaAtendimento,
          bio: data.bio,
          state: data.state,
          city: data.city,
          
          address: data.address,
        },
        documentFile
      );

      if (result.success) {
        setDocumentError(null);
        setNeedsEmailConfirmation(Boolean(result.needsEmailConfirmation));
        setIsSuccess(true);
        toast.success(
          result.needsEmailConfirmation
            ? "Conta criada! Confirme o seu e-mail e entre para concluir o cadastro."
            : "Cadastro enviado para análise!",
        );
      } else {
        if (result.documentError) setDocumentError(result.error || "Não foi possível enviar o documento.");
        toast.error(result.error || "Erro ao criar conta. Tente novamente.");
      }
    } catch (error) {
      console.error('Erro no submit:', error);
      toast.error("Erro inesperado. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validar arquivo
      const validation = PsychologistService.validateFile(file);
      if (!validation.valid) {
        setDocumentFile(null);
        setDocumentError(validation.error || "Arquivo inválido");
        e.target.value = "";
        toast.error(validation.error || "Arquivo inválido");
        return;
      }

      setDocumentFile(file);
      setDocumentError(null);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <Logo className="mb-12" />
          
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-success">{needsEmailConfirmation ? 'Conta criada!' : 'Cadastro Realizado!'}</CardTitle>
              <CardDescription>
                {needsEmailConfirmation
                  ? 'Enviamos um link para o seu e-mail. Confirme, entre com sua senha e envie o documento do CRP para concluir o cadastro.'
                  : 'Seu cadastro foi enviado para análise. Você receberá um email quando for aprovado.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => navigate('/')}
                className="w-full"
              >
                Fazer Login
              </Button>
              <Button 
                onClick={() => navigate('/')}
                variant="outline"
                className="w-full"
              >
                Voltar ao Início
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="relative flex items-center justify-center mb-8">
          <div className="absolute left-0">
            <BackButton />
          </div>
          <Logo />
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Cadastro de Psicólogo</CardTitle>
            <CardDescription>
              Preencha seus dados profissionais para se cadastrar como psicólogo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo *</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cpf"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF *</FormLabel>
                        <FormControl>
                          <InputMask
                            mask="999.999.999-99"
                            value={field.value}
                            onChange={field.onChange}
                          >
                            {(inputProps: InputHTMLAttributes<HTMLInputElement>) => <Input placeholder="000.000.000-00" {...inputProps} />}
                          </InputMask>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha *</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar Senha *</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="crp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CRP *</FormLabel>
                        <FormControl>
                          <InputMask
                            mask="99/999999"
                            value={field.value}
                            onChange={field.onChange}
                          >
                            {(inputProps: InputHTMLAttributes<HTMLInputElement>) => <Input placeholder="XX/XXXXXX" {...inputProps} />}
                          </InputMask>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="specialty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Especialidade *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione sua especialização" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {specializations.map((spec) => (
                              <SelectItem key={spec} value={spec}>
                                {spec}
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
              name="areaAtendimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">Áreas de Atendimento *</FormLabel>
                  <FormControl>
                    <MultiSelectModal
                      options={[...TRANSTORNOS]}
                      selectedValues={field.value || []}
                      onSelectionChange={field.onChange}
                      placeholder="Selecione as áreas de atendimento"
                      title="Selecionar áreas de atendimento"
                      noun={["área", "áreas"]}
                      isOpen={isAreasModalOpen}
                      onOpenChange={setIsAreasModalOpen}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
                </div>

                <LocationFields form={form} />


                <div className="space-y-2">
                  <FormLabel>Documento de Identificação *</FormLabel>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    required
                    aria-invalid={Boolean(documentError)}
                    className={`w-full ${documentError ? "border-destructive" : ""}`}
                  />
                  <FormDescription>
                    Envie documento de identidade, CNH ou CRP (PDF, JPG ou PNG - máx. 5MB)
                  </FormDescription>
                  {documentError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {documentFile ? `${documentFile.name}: ` : ""}{documentError}
                    </p>
                  ) : documentFile ? (
                    <p className="text-sm text-muted-foreground">
                      Arquivo escolhido: {documentFile.name}. Ele é enviado ao tocar em Cadastrar.
                    </p>
                  ) : null}
                </div>

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Biografia Profissional *</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          rows={4}
                          placeholder="Descreva sua experiência, formação e abordagem terapêutica..."
                        />
                      </FormControl>
                      <FormDescription>
                        Entre 50 e 500 caracteres. Esta informação será exibida em seu perfil.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <LegalConsents
                  userType="psychologist"
                  value={consents}
                  onChange={setConsents}
                  showErrors={showConsentErrors}
                />

                <div className="flex gap-4">
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? "Cadastrando..." : "Cadastrar"}
                  </Button>
                  <Button 
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/')}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Já tem uma conta? Faça login aqui
          </button>
        </div>
      </div>
    </div>
  );
};

export default PsychologistSignUpPublic;
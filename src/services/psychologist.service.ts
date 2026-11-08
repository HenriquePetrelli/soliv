import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { signupAcceptanceMetadata } from '@/lib/legal';

export interface PsychologistFormData {
  email: string;
  password: string;
  fullName: string;
  cpf: string;
  crp: string;
  specialty: string;
  areaAtendimento: string[];
  bio: string;
  state: string;
  city: string;
  address?: string;
}

/** Falha ao enviar o documento (a tela marca o campo do arquivo). */
class DocumentUploadError extends Error {}

export class PsychologistService {
  static async signUpPsychologist(
    formData: PsychologistFormData,
    documentFile?: File
  ): Promise<{ success: boolean; error?: string; documentError?: boolean; needsEmailConfirmation?: boolean }> {
    let userId: string | null = null;
    
    try {
      // 1. Validar dados antes de qualquer operação
      const validationError = this.validateFormData(formData);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // 2. Validar documento antes de criar usuário
      if (!documentFile) {
        return { success: false, error: 'Documento é obrigatório' };
      }

      const documentValidation = this.validateFile(documentFile);
      if (!documentValidation.valid) {
        return { success: false, error: documentValidation.error };
      }

      // 3. Criar a conta primeiro. O documento só pode ir para a pasta da
      //    própria pessoa logada (regra do armazenamento); antes ele era
      //    enviado sem login, numa pasta temporária, e todo envio falhava.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            user_type: 'psychologist',
            full_name: formData.fullName,
            cpf: formData.cpf,
            crp: formData.crp,
            specialty: formData.specialty,
            // O resto do formulário também, para concluir o cadastro no
            // primeiro acesso se o e-mail precisar ser confirmado antes
            // (sai dos dados do login quando o cadastro é concluído).
            bio: formData.bio,
            state: formData.state,
            city: formData.city,
            address: formData.address || null,
            area_atendimento: formData.areaAtendimento,
            // Aceite de idade, Termos e Política marcado na tela de cadastro.
            ...signupAcceptanceMetadata('psychologist'),
          },
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Falha ao criar usuário');
      }

      userId = authData.user.id;

      // O envio do documento e o perfil precisam da pessoa logada. Com a
      // confirmação de e-mail ligada no Supabase não há sessão aqui: a conta
      // fica criada e o cadastro termina no primeiro acesso, depois de
      // confirmar o e-mail (o login leva à tela de enviar o documento).
      // Antes a conta era apagada e ninguém conseguia se cadastrar.
      if (!authData.session) {
        return { success: true, needsEmailConfirmation: true };
      }

      await this.submitRegistration(userId, formData, documentFile);

      // O psicólogo só usa o app depois da aprovação: sai da sessão criada no
      // cadastro (o login avisa "em análise" enquanto não for aprovado).
      await supabase.auth.signOut({ scope: 'local' });
      return { success: true };
    } catch (error) {
      console.error('Erro no cadastro:', error);

      // Rollback: Remover usuário criado se algo falhou
      if (userId) {
        await this.cleanupFailedSignup(userId);
      }

      if (error instanceof DocumentUploadError) {
        return { success: false, error: error.message, documentError: true };
      }
      return {
        success: false,
        error: this.getUserFriendlyError(error),
      };
    }
  }

  /**
   * Conclui o cadastro de quem confirmou o e-mail e entrou pela primeira vez:
   * envia o documento e cria o cadastro (pendente) com os dados guardados no
   * cadastro. A conta não é apagada se algo falhar: dá para tentar de novo.
   */
  static async completePendingRegistration(
    documentFile: File,
  ): Promise<{ success: boolean; error?: string; documentError?: boolean }> {
    const documentValidation = this.validateFile(documentFile);
    if (!documentValidation.valid) {
      return { success: false, error: documentValidation.error, documentError: true };
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Entre na sua conta para concluir o cadastro.' };
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const text = (key: string) => (typeof meta[key] === 'string' ? (meta[key] as string) : '');
    const formData: PsychologistFormData = {
      email: user.email ?? '',
      password: '',
      fullName: text('full_name'),
      cpf: text('cpf'),
      crp: text('crp'),
      specialty: text('specialty'),
      areaAtendimento: Array.isArray(meta.area_atendimento) ? (meta.area_atendimento as string[]) : [],
      bio: text('bio'),
      state: text('state'),
      city: text('city'),
      address: text('address') || undefined,
    };
    if (!formData.fullName || !formData.crp || !formData.cpf) {
      return { success: false, error: 'Os dados do cadastro não foram encontrados. Fale com o suporte.' };
    }
    try {
      await this.submitRegistration(user.id, formData, documentFile);
      await supabase.auth.signOut({ scope: 'local' });
      return { success: true };
    } catch (error) {
      console.error('Erro ao concluir cadastro:', error);
      if (error instanceof DocumentUploadError) {
        return { success: false, error: error.message, documentError: true };
      }
      return { success: false, error: this.getUserFriendlyError(error) };
    }
  }

  /** Envia o documento e cria o cadastro pendente; tira os dados pessoais do login. */
  private static async submitRegistration(userId: string, formData: PsychologistFormData, documentFile: File) {
    {
      // 4. Enviar o documento para a pasta da pessoa.
      const uploadResult = await this.uploadDocument(documentFile, userId);
      if (!uploadResult.success) {
        throw new DocumentUploadError(uploadResult.error || 'Falha no upload do documento. Tente novamente.');
      }
      const finalDocumentUrl = uploadResult.url || '';

      // 6. Criar perfil completo em transação
      const { data: profileResult, error: dbError } = await supabase.rpc('create_psychologist_profile', {
        p_user_id: userId,
        p_full_name: formData.fullName,
        p_email: formData.email,
        p_crp_number: formData.crp,
        p_specialization: formData.specialty,
        p_bio: formData.bio,
        p_state: formData.state,
        p_city: formData.city,
        p_address: formData.address || null,
        p_document_url: finalDocumentUrl,
        p_cpf: formData.cpf,
        p_area_atendimento: JSON.stringify(formData.areaAtendimento),
      });

      if (dbError) {
        console.error('Erro na função create_psychologist_profile:', dbError);
        throw new Error(`Erro ao criar perfil: ${dbError.message}`);
      }

      // Type assertion for the stored procedure result
      const result = profileResult as { success?: boolean; error?: string };
      if (!result?.success) {
        console.error('Função retornou erro:', result?.error);
        throw new Error(result?.error || 'Falha ao criar perfil de psicólogo');
      }

      // Dados pessoais não ficam nos dados do login (vão dentro do token).
      await supabase.auth
        .updateUser({ data: { cpf: null, bio: null, address: null, state: null, city: null, area_atendimento: null } })
        .catch(() => undefined);
    }
  }

  private static async uploadDocument(
    file: File,
    userId: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const fileExt = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      return { success: true, url: publicUrl };
    } catch (error) {
      console.error('Erro ao enviar documento:', error);
      return {
        success: false,
        error: 'Não foi possível enviar o documento. Confira se é PDF, JPG ou PNG de até 5 MB e tente de novo.',
      };
    }
  }

  private static async cleanupFailedSignup(userId: string): Promise<void> {
    try {
      console.log('Iniciando cleanup para usuário:', userId);
      
      // 1. Remover do storage se existir
      const { data: files } = await supabase.storage
        .from('documents')
        .list(userId);
      
      if (files && files.length > 0) {
        const filesToRemove = files.map(f => `${userId}/${f.name}`);
        await supabase.storage
          .from('documents')
          .remove(filesToRemove);
        console.log('Documentos removidos do storage');
      }

      // 2. Remover registros do banco
      await supabase
        .from('psychologists')
        .delete()
        .eq('user_id', userId);

      await supabase
        .from('psychologist_registrations')
        .delete()
        .eq('user_id', userId);

      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      // 3. IMPORTANTE: Remover usuário do auth usando edge function
      try {
        const { error: cleanupError } = await supabase.functions.invoke('cleanup-user', {
          body: { userId }
        });
        
        if (cleanupError) {
          console.warn('Erro ao fazer cleanup completo do usuário:', cleanupError);
        } else {
          console.log('Cleanup completo do usuário realizado com sucesso');
        }
      } catch (authError) {
        console.warn('Erro ao chamar função de cleanup:', authError);
      }

      // A conta foi apagada: sai da sessão criada no cadastro.
      await supabase.auth.signOut({ scope: 'local' });
      console.log('Cleanup concluído para usuário:', userId);
    } catch (cleanupError) {
      console.error('Erro no cleanup:', cleanupError);
    }
  }

  private static validateFormData(formData: PsychologistFormData): string | null {
    if (!formData.email) return 'Email é obrigatório';
    if (!formData.password) return 'Senha é obrigatória';
    if (!formData.fullName) return 'Nome completo é obrigatório';
    if (!formData.crp) return 'CRP é obrigatório';
    if (!formData.specialty) return 'Especialidade é obrigatória';
    if (!formData.bio || formData.bio.length < 50) return 'Biografia deve ter pelo menos 50 caracteres';
    return null;
  }

  private static getUserFriendlyError(error: unknown): string {
    const defaultMessage = 'Ocorreu um erro durante o cadastro. Tente novamente.';
    
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes('406')) {
        return 'Erro de comunicação com o servidor. Atualize a página e tente novamente.';
      }
      if (message.includes('400')) {
        return 'Dados inválidos. Verifique as informações fornecidas.';
      }
      if (message.includes('document')) {
        return 'Erro ao enviar documento. O arquivo deve ser PDF, JPG ou PNG (máx. 5MB).';
      }
      if (message.includes('already registered') || message.includes('duplicate')) {
        return 'Este email ou CRP já está cadastrado.';
      }
      if (message.includes('rate limit')) {
        return 'Muitas tentativas. Aguarde alguns minutos.';
      }
      if (message.includes('violates row-level security')) {
        return 'Erro de permissão. Tente novamente em alguns segundos.';
      }
      if (message.includes('valid_cpf_format')) {
        return 'CPF inválido. Verifique os números digitados.';
      }

      // Return the original error message if it's user-friendly
      if (error.message && error.message.length < 100) {
        return error.message;
      }
    }
    
    return defaultMessage;
  }

  static validateFile(file: File): { valid: boolean; error?: string } {
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!validTypes.includes(file.type)) {
      return {
        valid: false,
        error: 'Envie um arquivo PDF, JPG ou PNG.'
      };
    }
    
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'O tamanho máximo permitido é 5MB.'
      };
    }
    
    return { valid: true };
  }

  private static handleSupabaseError(error: { message?: string; code?: string } | null | undefined): string {
    if (!error) return 'Erro desconhecido';
    
    // Erros de autenticação
    if (error.message?.includes('Email rate limit exceeded')) {
      return 'Muitas tentativas. Aguarde alguns minutos.';
    }
    
    // Erros de storage
    if (error.message?.includes('The resource already exists')) {
      return 'Documento já enviado anteriormente.';
    }
    
    if (error.message?.includes('not found')) {
      return 'Serviço de armazenamento indisponível.';
    }
    
    // Erros de banco de dados
    if (error.code === '23505') {
      return 'CRP ou email já cadastrado.';
    }
    
    return error.message || 'Erro durante a operação.';
  }
}
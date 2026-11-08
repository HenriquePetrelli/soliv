import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/utils/errorMessage";
import DeleteAccountCard from "@/components/DeleteAccountCard";
import { passwordProblem } from "@/lib/password";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';
const AccountSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  // Enquanto nome e e-mail chegam, os campos aparecem como skeleton (antes
  // apareciam vazios e se preenchiam depois).
  const [loadingUser, setLoadingUser] = useState(true);
  const [user, setUser] = useState<(User & { profile: Tables<'profiles'> | null }) | null>(null);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const {
        data: { user },
      } = await getSessionUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();

        setUser({ ...user, profile });
        setFormData((prev) => ({
          ...prev,
          fullName: profile?.full_name || "",
          email: user.email || "",
        }));
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setLoadingUser(false);
    }
  };

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: formData.fullName })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      // Update email if changed
      if (formData.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: formData.email,
        });
        if (emailError) throw emailError;
      }

      toast({ title: "Dados atualizados" });

      fetchUserData();
    } catch (error: unknown) {
      toast({
        title: "Erro",
        description: getFriendlyErrorMessage(error, "Erro ao atualizar dados"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!formData.currentPassword) {
      toast({
        title: "Erro",
        description: "Informe sua senha atual",
        variant: "destructive",
      });
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    // Mesma regra do cadastro e da recuperação de senha (8+ com letras e números).
    const weakPassword = passwordProblem(formData.newPassword);
    if (weakPassword) {
      toast({
        title: "Erro",
        description: weakPassword,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Confirm the caller actually knows the current password before
      // changing it — updateUser() alone would let anyone with a live
      // session (e.g. a stolen token, an unlocked shared device) lock the
      // real owner out without ever proving they know the current one.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: formData.currentPassword,
      });

      if (reauthError) {
        toast({
          title: "Erro",
          description: "Senha atual incorreta",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword,
      });

      if (error) throw error;

      toast({ title: "Senha atualizada" });

      setFormData((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
    } catch (error: unknown) {
      toast({
        title: "Erro",
        description: getFriendlyErrorMessage(error, "Erro ao atualizar senha"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Alterar Dados da Conta" backTo="/profile" />

      {/* Content */}
      <div className="p-4 space-y-6 max-w-md mx-auto">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              {loadingUser ? <Skeleton className="h-10 w-full rounded-md" /> : <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Digite seu nome completo"
              />}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              {loadingUser ? <Skeleton className="h-10 w-full rounded-md" /> : <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Digite seu email"
              />}
            </div>

            <Button onClick={handleUpdateProfile} disabled={loading} className="w-full">
              <Save size={16} className="mr-2" />
              {loading ? "Salvando..." : "Salvar Informações"}
            </Button>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>Alterar Senha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Senha Atual</Label>
              <Input
                id="currentPassword"
                type="password"
                value={formData.currentPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, currentPassword: e.target.value }))}
                placeholder="Digite sua senha atual"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <Input
                id="newPassword"
                type="password"
                value={formData.newPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, newPassword: e.target.value }))}
                placeholder="Digite a nova senha"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirme a nova senha"
              />
            </div>

            <Button
              onClick={handleUpdatePassword}
              disabled={loading || !formData.currentPassword || !formData.newPassword || !formData.confirmPassword}
              className="w-full"
              variant="outline"
            >
              <Save size={16} className="mr-2" />
              {loading ? "Alterando..." : "Alterar Senha"}
            </Button>
          </CardContent>
        </Card>

        {loadingUser ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : (
          user?.profile?.user_type === "patient" && user?.email && <DeleteAccountCard email={user.email} />
        )}
      </div>
    </div>
  );
};

export default AccountSettings;

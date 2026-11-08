import { Button } from "@/components/ui/button";
import { Play, Clock, Music } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { soundsData, type Category } from "@/data/soundsData";
import PageHeader from "@/components/PageHeader";
import PatientBottomNav from "@/components/PatientBottomNav";

const SoundCategory = () => {
  const navigate = useNavigate();
  const { categoryId, subcategoryId } = useParams<{ categoryId: string; subcategoryId: string }>();

  const isSubcategory = subcategoryId !== undefined;
  const id = isSubcategory ? subcategoryId : categoryId;
  const category: Category | undefined = isSubcategory
    ? soundsData.subcategories[subcategoryId as keyof typeof soundsData.subcategories]
    : soundsData.categories[categoryId as keyof typeof soundsData.categories];


  if (!category) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">
            {isSubcategory ? "Subcategoria" : "Categoria"} não encontrada
          </h2>
          <Button onClick={() => navigate("/sounds")}>Voltar às categorias</Button>
        </div>
      </div>
    );
  }

  const goToPlaylist = (startIndex: number) => {
    navigate(`/sounds/player/playlist/${id}`, { state: { startIndex } });
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <PatientBottomNav />
      <PageHeader title={category.title} backTo="/sounds" />

      {(category).description && (
        <div className="bg-card border-b border-border">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
            <p className="text-sm sm:text-base text-muted-foreground">
              {(category).description}
            </p>
          </div>
        </div>
      )}

      {/* Stats + Play all */}
      <div className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-foreground leading-none">
              {category.sounds.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Sons disponíveis</p>
          </div>
          <Button
            onClick={() => goToPlaylist(0)}
            className="rounded-full font-semibold h-11 px-6 shadow-md"
          >
            <Play className="w-4 h-4 mr-2 fill-current" />
            Reproduzir todos
          </Button>
        </div>
      </div>

      {/* Sound list */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {category.sounds.map((sound, idx) => (
          <button
            key={sound.id}
            onClick={() => goToPlaylist(idx)}
            className="w-full group flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-primary/40 transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shrink-0 group- transition-transform">
              <Play className="w-5 h-5 fill-current" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{sound.name}</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1 truncate">
                  <Music className="w-3 h-3" />
                  {sound.category}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {sound.duration}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SoundCategory;

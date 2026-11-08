import { useLocation } from "react-router-dom";
import { routeSkeletonFor } from "@/components/skeletons/routeSkeletons";

/** Fallback do carregamento das páginas: o skeleton da própria tela. */
const RouteSkeleton = () => {
  const { pathname } = useLocation();
  return <>{routeSkeletonFor(pathname)}</>;
};

export default RouteSkeleton;

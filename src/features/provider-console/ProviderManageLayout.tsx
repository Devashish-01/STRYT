import { Outlet, useParams } from "react-router-dom";
import { ProviderAppointmentsContext, useLoadProviderAppointments } from "./providerAppointments";

export default function ProviderManageLayout() {
  const { id = "" } = useParams();
  const appointments = useLoadProviderAppointments(id);
  return <ProviderAppointmentsContext.Provider value={appointments}><Outlet /></ProviderAppointmentsContext.Provider>;
}

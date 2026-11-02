import ClientiGrid from '../components/ClientiGrid';

/**
 * ClientiPage component serves as the main container view for managing customer records (Anagrafiche).
 * It delegates the rendering, data retrieval, and grid interaction logic entirely to the ClientiGrid component.
 */
const ClientiPage = () => {
  return (
    /* Render the core grid component responsible for listing, filtering, and managing customer data */
    <ClientiGrid />
  );
};

export default ClientiPage;
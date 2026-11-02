import { useLocation, useParams } from 'react-router-dom';

export const useTrailingRouteParam = name => {
  const params = useParams();
  const { pathname } = useLocation();
  if (params[name] === undefined) return undefined;

  // Read the encoded segment: router params conflate a literal "%2F" with "/".
  const segment = pathname.replace(/\/+$/, '').split('/').pop();
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    console.error('Parametro URL non valido:', error);
    return segment;
  }
};

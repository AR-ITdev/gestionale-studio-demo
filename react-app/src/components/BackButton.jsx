/**
 * BackButton component renders a compact navigation button with an arrow icon.
 * It is typically used in headers or toolbars to allow users to return to the previous view.
 * 
 * @param {Object} props - Component properties
 * @param {Function} props.onBack - Callback function executed when the button is clicked
 * @returns {JSX.Element|null} - Returns the button element if `onBack` is provided, otherwise null.
 */
export const BackButton = ({ onBack, disabled = false }) => {
  // Do not render the component if no callback handler is supplied
  if (!onBack) return null;

  return (
    <button
      onClick={onBack}
      disabled={disabled}
      className="btn btn-sm btn-secondary text-white rounded-0 px-3 fw-bold d-flex align-items-center gap-1 opacity-75"
      style={{ fontSize: '13px' }}
    >
      {/* Left arrow icon representing backward navigation */}
      <i className="bi bi-arrow-left"></i>
    </button>
  );
};

export default BackButton;
export default function NavItem({ label, active, onClick }) {
  return (
    <button type="button" className={`nav-item${active ? ' active' : ''}`} onClick={onClick}>
      <span>{label}</span>
    </button>
  );
}

import {Modal} from './Modal';

const GROUPS: {title: string; items: [string, string][]}[] = [
  {
    title: 'Reproducción',
    items: [
      ['Espacio', 'Reproducir o pausar el montaje'],
      ['← →', 'Mover un fotograma atrás o adelante'],
      ['F', 'Cine · Amplía el monitor de vídeo'],
      ['⇧ F', 'Enfoque · Amplía el monitor y la línea de tiempo'],
    ],
  },
  {
    title: 'Montaje',
    items: [
      ['S', 'Dividir el clip en el cabezal'],
      ['Supr', 'Eliminar la selección (uno o varios clips)'],
      ['Ctrl/⌘ D', 'Duplicar los clips seleccionados'],
      ['Shift / ⌘ clic', 'Seleccionar un rango o varios clips'],
      ['← →', 'Con un clip enfocado, pasar al anterior o al siguiente'],
      ['Ctrl/⌘ Z', 'Deshacer el último cambio'],
      ['Ctrl/⌘ ⇧ Z', 'Rehacer'],
    ],
  },
  {
    title: 'Ventanas',
    items: [
      ['?', 'Abrir esta lista de atajos'],
      ['Esc', 'Cerrar la ventana activa o volver a la vista Editor'],
    ],
  },
];

export function Shortcuts({onClose}: {onClose: () => void}) {
  return <Modal titleId="shortcut-title" onClose={onClose} wide>
    <header>
      <div>
        <p className="modal-kicker">ATAJOS</p>
        <h2 id="shortcut-title">Trabaja sin soltar el teclado</h2>
        <p>Funcionan cuando el foco no está en un campo de texto.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Cerrar">✕</button>
    </header>
    <div className="shortcut-grid">
      {GROUPS.map(group => <section key={group.title}>
        <h3>{group.title}</h3>
        <dl>
          {group.items.map(([keys, label]) => <div key={keys}>
            <dt><kbd>{keys}</kbd></dt>
            <dd>{label}</dd>
          </div>)}
        </dl>
      </section>)}
    </div>
  </Modal>;
}

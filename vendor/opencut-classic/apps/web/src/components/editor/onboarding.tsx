"use client";

import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "../ui/dialog";

const STEPS = [
	{
		title: "Bienvenido a Elite Editor",
		points: [
			"Editor de vídeo local y gratuito: tus proyectos no salen de este equipo.",
			"Importa clips en Medios y arrástralos a la timeline para empezar.",
			"Exporta el montaje completo con el botón Exportar.",
		],
	},
	{
		title: "Edita con tu asistente",
		points: [
			"Asistente IA: detecta silencios, transcribe y propone cortes revisables.",
			"Edición por texto: quita frases, muletillas («eh», «mmm») y repeticiones.",
			"Escribe instrucciones como «quita los primeros 5 segundos»: siempre ves el cambio antes de aplicarlo.",
		],
	},
	{
		title: "Acabado profesional",
		points: [
			"Zoom ◆: encuadres con rombos y movimientos automáticos en un clic.",
			"Transiciones: entradas y salidas animadas con keyframes editables.",
			"Efectos, belleza en directo, 188 sonidos libres y textos con estilo.",
		],
	},
] as const;

export function Onboarding() {
	const [step, setStep] = useState(0);
	const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage({
		key: "hasSeenOnboarding",
		defaultValue: false,
	});
	const current = STEPS[Math.min(step, STEPS.length - 1)];
	const last = step >= STEPS.length - 1;
	const close = () => setHasSeenOnboarding({ value: true });

	return (
		<Dialog open={!hasSeenOnboarding} onOpenChange={close}>
			<DialogContent className="xeno-scanlines sm:max-w-[460px]">
				<DialogTitle>
					<span className="sr-only">{current.title}</span>
				</DialogTitle>
				<DialogBody>
					<div className="space-y-5">
						<div className="space-y-3">
							<div className="flex items-center gap-3">
								<span className="xeno-orbit" aria-hidden />
								<div className="flex-1">
									<p className="xeno-kicker">
										Transmisión {step + 1} / {STEPS.length}
									</p>
									<div className="mt-1 flex gap-1" aria-hidden>
										{STEPS.map((s, i) => (
											<span
												key={s.title}
												className={`h-0.5 flex-1 rounded-full ${i <= step ? "bg-emerald-300 shadow-[0_0_8px_#5effc8]" : "bg-white/10"}`}
											/>
										))}
									</div>
								</div>
							</div>
							<h2 className="xeno-holo-text text-xl font-bold tracking-wide md:text-2xl">
								{current.title}
							</h2>
							<ul className="text-muted-foreground space-y-2 text-sm">
								{current.points.map((point) => (
									<li key={point} className="flex gap-2">
										<span aria-hidden className="text-emerald-300">
											◆
										</span>
										<span>{point}</span>
									</li>
								))}
							</ul>
						</div>
						<div className="flex gap-2">
							{last ? (
								<Button
									variant="outline"
									className="flex-1"
									onClick={() => {
										useAssetsPanelStore.getState().setActiveTab("assistant");
										close();
									}}
								>
									Abrir el asistente
								</Button>
							) : (
								<Button variant="ghost" onClick={close}>
									Saltar
								</Button>
							)}
							<Button
								variant="default"
								className="flex-1"
								onClick={() => (last ? close() : setStep(step + 1))}
							>
								{last ? "Empezar a editar" : "Siguiente"}
								<ArrowRightIcon className="size-4" />
							</Button>
						</div>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}

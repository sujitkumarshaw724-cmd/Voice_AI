import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Zap, Trash2, X, ListChecks } from "lucide-react";
import { Macro, getMacros, deleteMacro } from "../lib/macros";

interface MacroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MacroModal({ isOpen, onClose }: MacroModalProps) {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMacros(getMacros());
    }
  }, [isOpen]);

  const handleDelete = (id: string) => {
    deleteMacro(id);
    setMacros(getMacros());
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[80vh] bg-zinc-900 border border-amber-500/30 rounded-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Saved Macros</h2>
              </div>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {macros.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Koi macro save nahi hai abhi.
                  <div className="text-xs mt-1 opacity-70">
                    Zoya se bolo "isko macro banake yaad rakho" kisi task ke baad.
                  </div>
                </div>
              ) : (
                macros.map((macro) => (
                  <div
                    key={macro.id}
                    className="bg-white/5 border border-white/10 rounded-xl p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="text-left flex-1"
                        onClick={() => setExpandedId(expandedId === macro.id ? null : macro.id)}
                      >
                        <div className="text-sm font-medium text-white">{macro.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {macro.steps.length} step{macro.steps.length !== 1 ? "s" : ""} · {macro.createdAt}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDelete(macro.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                        title="Delete macro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {expandedId === macro.id && (
                      <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                        {macro.steps.map((step, i) => (
                          <div key={i} className="text-xs text-zinc-400 font-mono">
                            {i + 1}. {step.tool}({JSON.stringify(step.args)})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

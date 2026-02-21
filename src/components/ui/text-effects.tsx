"use client";
import React from "react";
import { motion } from "framer-motion";

interface TextGenerateEffectProps {
    words: string;
    className?: string;
}

export function TextGenerateEffect({ words, className }: TextGenerateEffectProps) {
    const wordArray = words.split(" ");

    return (
        <div className={className}>
            {wordArray.map((word, idx) => (
                <motion.span
                    key={`${word}-${idx}`}
                    initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{
                        duration: 0.4,
                        delay: idx * 0.08,
                        ease: "easeOut",
                    }}
                    className="inline-block mr-[0.3em]"
                >
                    {word}
                </motion.span>
            ))}
        </div>
    );
}

interface TypewriterEffectProps {
    words: string[];
    className?: string;
}

export function TypewriterEffect({ words, className }: TypewriterEffectProps) {
    const [currentWordIndex, setCurrentWordIndex] = React.useState(0);
    const [displayText, setDisplayText] = React.useState("");
    const [isDeleting, setIsDeleting] = React.useState(false);

    React.useEffect(() => {
        const currentWord = words[currentWordIndex];
        let timeout: NodeJS.Timeout;

        if (!isDeleting && displayText === currentWord) {
            timeout = setTimeout(() => setIsDeleting(true), 2000);
        } else if (isDeleting && displayText === "") {
            setIsDeleting(false);
            setCurrentWordIndex((prev) => (prev + 1) % words.length);
        } else {
            timeout = setTimeout(
                () => {
                    setDisplayText(
                        isDeleting
                            ? currentWord.substring(0, displayText.length - 1)
                            : currentWord.substring(0, displayText.length + 1)
                    );
                },
                isDeleting ? 30 : 80
            );
        }

        return () => clearTimeout(timeout);
    }, [displayText, isDeleting, currentWordIndex, words]);

    return (
        <span className={className}>
            {displayText}
            <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                className="inline-block w-[3px] h-[1em] bg-cyan-400 ml-1 align-middle"
            />
        </span>
    );
}

import type { UIMessage } from 'ai';
import { isTextUIPart, isToolUIPart, getToolName } from 'ai';
import { ToolResultDisplay } from './ToolResultDisplay';

interface Props {
  message: UIMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && (
          <div className="text-xs text-gray-400 mb-1 ml-1">AI Assistant</div>
        )}
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${isUser ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'}`}>
          {message.parts.map((part, i) => {
            if (isTextUIPart(part)) {
              return (
                <p key={i} className="whitespace-pre-wrap leading-relaxed">
                  {part.text}
                </p>
              );
            }

            if (isToolUIPart(part)) {
              const toolName = getToolName(part);
              if (part.state === 'output-available') {
                return (
                  <ToolResultDisplay
                    key={i}
                    toolName={toolName}
                    result={part.output}
                  />
                );
              }
              return (
                <div key={i} className="text-xs text-gray-400 italic py-1">
                  Using {toolName}…
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
}

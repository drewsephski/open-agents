# Pin execution backends to chats

Each chat has one durable Execution Backend, and cross-backend continuation creates a Backend Fork instead of switching a live chat. Provider runtimes have incompatible session identifiers, tool events, approvals, and resume semantics, so pretending they share one session would risk duplicated effects and corrupt histories.

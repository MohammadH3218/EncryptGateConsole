import { NextRequest } from "next/server";
import { proxy } from "../../_proxy";

export async function POST(req: NextRequest) { return proxy(req, "POST"); }
export async function GET(req: NextRequest) { return proxy(req, "GET"); }